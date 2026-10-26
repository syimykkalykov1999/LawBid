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
      (_, i) => `u${String(i).padStart(4, '0')}`,
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
    const emit = jest.fn().mockResolvedValue({ id: 'n' });
    const runner = new BroadcastFanoutRunner(
      { mode: 'api' },
      { get: () => undefined } as unknown as ConfigService,
      { user: { findMany } } as unknown as PrismaService,
      { emit } as unknown as NotificationsService,
      { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
    );
    runner.onApplicationBootstrap(); // no REDIS_URL → inline
    await runner.start({
      broadcastId: 'b1',
      title: 'Hi',
      body: 'News',
      audience: 'all',
      stateCode: null,
    });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledTimes(ids.length);
    expect(emit).toHaveBeenCalledWith({
      type: 'admin_broadcast',
      recipientId: 'u0000',
      payload: { title: 'Hi', body: 'News', broadcastId: 'b1' },
    });
  });
});
