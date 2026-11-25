import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { broadcastAudienceWhere } from './broadcast-audience';
import {
  BROADCAST_BATCH,
  BroadcastFanoutRunner,
} from './broadcast-fanout.runner';

describe('broadcastAudienceWhere', () => {
  it('no state: role filter only', () => {
    expect(broadcastAudienceWhere('assistants')).toEqual({
      status: 'active',
      deleted_at: null,
      role: 'assistant',
    });
    expect(broadcastAudienceWhere('all').role).toEqual({
      in: ['client', 'attorney', 'assistant'],
    });
  });

  it("assistants with a state are matched through their attorney's licenses", () => {
    const where = broadcastAudienceWhere('assistants', 'IL');
    expect(where.role).toBe('assistant');
    expect(where.OR).toContainEqual({
      assistant_memberships: {
        some: {
          status: 'active',
          attorney: {
            attorney_profile: { licenses: { some: { state_code: 'IL' } } },
          },
        },
      },
    });
    // Clients and attorneys keep their own rules.
    expect(where.OR).toContainEqual({ client_profile: { state_code: 'IL' } });
    expect(where.OR).toContainEqual({
      attorney_profile: { licenses: { some: { state_code: 'IL' } } },
    });
  });
});

describe('BroadcastFanoutRunner (inline, no Redis)', () => {
  it('emits to every user in keyset batches', async () => {
    const ids = Array.from(
      { length: BROADCAST_BATCH + 3 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const findMany = jest.fn(
      (args: { where: { id?: { gt: string } }; take: number }) => {
        const after = args.where.id?.gt;
        const start = after ? ids.indexOf(after) + 1 : 0;
        return Promise.resolve(
          ids.slice(start, start + args.take).map((id) => ({ id })),
        );
      },
    );
    // The real emitMany skips a (user, dedupe key) row it already has.
    const stored = new Set<string>();
    const emitMany = jest.fn(
      (input: { recipientIds: string[]; dedupeKey: string }) => {
        let n = 0;
        for (const id of input.recipientIds) {
          const k = `${id}|${input.dedupeKey}`;
          if (!stored.has(k)) {
            stored.add(k);
            n += 1;
          }
        }
        return Promise.resolve(n);
      },
    );
    const runner = new BroadcastFanoutRunner(
      { mode: 'api' },
      { get: () => undefined } as unknown as ConfigService,
      { user: { findMany } } as unknown as PrismaService,
      { emitMany } as unknown as NotificationsService,
      { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
    );
    runner.onApplicationBootstrap(); // no REDIS_URL → inline
    const job = {
      broadcastId: 'b1',
      title: 'Hi',
      body: 'News',
      audience: 'all' as const,
      stateCode: null,
    };
    await runner.start(job);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(stored.size).toBe(ids.length);
    expect(emitMany).toHaveBeenCalledWith({
      type: 'admin_broadcast',
      recipientIds: expect.arrayContaining([ids[0]]),
      payload: { title: 'Hi', body: 'News', broadcastId: 'b1' },
      dedupeKey: 'admin_broadcast:b1',
    });
  });

  it('pack C (round 2 #9): a retried batch sends nobody a second notice', async () => {
    const u = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
    const ids = [u(1), u(2), u(3)];
    const findMany = jest.fn(() => Promise.resolve(ids.map((id) => ({ id }))));
    const stored = new Map<string, number>();
    const emitMany = jest.fn(
      (input: { recipientIds: string[]; dedupeKey: string }) => {
        let n = 0;
        for (const id of input.recipientIds) {
          const k = `${id}|${input.dedupeKey}`;
          if (!stored.has(k)) n += 1;
          stored.set(k, (stored.get(k) ?? 0) + 1);
        }
        return Promise.resolve(n);
      },
    );
    const runner = new BroadcastFanoutRunner(
      { mode: 'api' },
      { get: () => undefined } as unknown as ConfigService,
      { user: { findMany } } as unknown as PrismaService,
      { emitMany } as unknown as NotificationsService,
      { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
    );
    const data = {
      broadcastId: 'b2',
      title: 'Hi',
      body: 'News',
      audience: 'all' as const,
      stateCode: null,
      after: null,
    };
    // The job runs, fails after the emits (say a Redis blip), BullMQ retries.
    await runner.emitBatch(data);
    const firstCalls = emitMany.mock.results.length;
    await runner.emitBatch(data);
    const rows = [...stored.keys()];
    expect(rows.sort()).toEqual(ids.map((id) => `${id}|admin_broadcast:b2`));
    // The retry stored no new row, so it queued no second push.
    const again = await Promise.all(
      emitMany.mock.results
        .slice(firstCalls)
        .map((r) => r.value as Promise<number>),
    );
    expect(again.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
