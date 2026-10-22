import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import {
  GROUP_FANOUT_PARTITIONS,
  GroupFanoutQueue,
  broadcastAudiences,
  fanoutPartition,
  fanoutQueueName,
} from './group-fanout.queue';

/** Owner 2026-10-22 (server load audit, finding 7). */
describe('fanoutPartition', () => {
  it('is stable and in range', () => {
    const id = '6f1c2a34-0000-4000-8000-000000000001';
    expect(fanoutPartition(id)).toBe(fanoutPartition(id));
    for (let i = 0; i < 200; i++) {
      const p = fanoutPartition(`group-${i}`);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(GROUP_FANOUT_PARTITIONS);
    }
    expect(fanoutQueueName(3)).toBe('group-fanout-3');
  });

  it('spreads groups over every partition', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      seen.add(
        fanoutPartition(
          `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      );
    }
    expect(seen.size).toBe(GROUP_FANOUT_PARTITIONS);
  });
});

describe('broadcastAudiences', () => {
  it('the sender, the mentioned and everyone else: one publish each', () => {
    const ids = ['s', 'a', 'b', 'c', 'd'];
    const out = broadcastAudiences(ids, 's', ['b', 'd'], false);
    expect(out).toHaveLength(3);
    expect(out).toContainEqual({
      userIds: ['s'],
      mine: true,
      mentionsMe: false,
    });
    expect(out).toContainEqual({
      userIds: ['a', 'c'],
      mine: false,
      mentionsMe: false,
    });
    expect(out).toContainEqual({
      userIds: ['b', 'd'],
      mine: false,
      mentionsMe: true,
    });
    // Every member exactly once.
    expect(out.flatMap((g) => g.userIds).sort()).toEqual([...ids].sort());
  });

  it('a deleted message mentions nobody; a service line is nobody’s', () => {
    expect(broadcastAudiences(['s', 'a'], 's', ['a'], true)).toEqual([
      { userIds: ['s'], mine: true, mentionsMe: false },
      { userIds: ['a'], mine: false, mentionsMe: false },
    ]);
    expect(broadcastAudiences(['a', 'b'], null, [], false)).toEqual([
      { userIds: ['a', 'b'], mine: false, mentionsMe: false },
    ]);
  });

  it('512 members → at most 4 publishes', () => {
    const ids = Array.from({ length: 512 }, (_, i) => `u${i}`);
    expect(
      broadcastAudiences(ids, 'u0', ['u0', 'u1', 'u2'], false).length,
    ).toBeLessThanOrEqual(4);
  });
});

describe('GroupFanoutQueue', () => {
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;

  it('without Redis the delivery runs inline', async () => {
    const q = new GroupFanoutQueue(
      { get: () => undefined } as unknown as ConfigService,
      logger,
    );
    await q.onApplicationBootstrap();
    const inline = jest.fn().mockResolvedValue(undefined);
    await q.enqueue(
      { kind: 'message', groupId: 'g1', messageId: 'm1' },
      'fo-m1',
      inline,
    );
    expect(inline).toHaveBeenCalledTimes(1);
  });

  function queued() {
    const q = new GroupFanoutQueue(
      { get: () => undefined } as unknown as ConfigService,
      logger,
    );
    const adds: { name: string; data: unknown; opts: { jobId: string } }[] = [];
    const queues = Array.from({ length: GROUP_FANOUT_PARTITIONS }, (_, i) => ({
      name: fanoutQueueName(i),
      add: jest.fn((name: string, data: unknown, opts: { jobId: string }) => {
        adds.push({ name, data, opts });
        return Promise.resolve();
      }),
    }));
    (q as unknown as { queues: unknown }).queues = queues;
    return { q, queues, adds };
  }

  it("queues on the group's partition with the job id per message", async () => {
    const { q, queues, adds } = queued();
    const inline = jest.fn();
    await q.enqueue(
      { kind: 'message', groupId: 'g1', messageId: 'm1', push: true },
      'fo-m1',
      inline,
    );
    expect(inline).not.toHaveBeenCalled();
    expect(queues[fanoutPartition('g1')].add).toHaveBeenCalledTimes(1);
    expect(adds[0].opts.jobId).toBe('fo-m1');
    expect(adds[0].data).toEqual({
      kind: 'message',
      groupId: 'g1',
      messageId: 'm1',
      push: true,
    });
  });

  it('carries the demo world into the job', async () => {
    const { q, adds } = queued();
    await demoContext.run(true, () =>
      q.enqueue(
        { kind: 'broadcast', groupId: 'g1', messageId: 'm1' },
        'b-m1-1',
        jest.fn(),
      ),
    );
    expect(adds[0].data).toMatchObject({ demo: true });
  });

  it('a failed enqueue still delivers (inline)', async () => {
    const { q, queues } = queued();
    queues[fanoutPartition('g1')].add.mockRejectedValueOnce(
      new Error('redis down'),
    );
    const inline = jest.fn().mockResolvedValue(undefined);
    await q.enqueue(
      { kind: 'message', groupId: 'g1', messageId: 'm1' },
      'fo-m1',
      inline,
    );
    expect(inline).toHaveBeenCalledTimes(1);
  });
});
