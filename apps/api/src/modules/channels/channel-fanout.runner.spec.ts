import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BlocksService } from '../blocks/blocks.service';
import type { NotificationsService } from '../notifications/notifications.service';
import {
  CHANNEL_FANOUT_BATCH,
  ChannelFanoutRunner,
  type ChannelFanoutJob,
} from './channel-fanout.runner';

/** Owner 2026-10-22 (server load audit, finding 7): a channel post's
 * subscribers are notified in batches of 500 — one INSERT and one bulk push
 * enqueue per batch — off the request. */
const subscribers = Array.from(
  { length: CHANNEL_FANOUT_BATCH * 2 + 7 },
  (_, i) => `u${String(i).padStart(5, '0')}`,
);

function setup() {
  const findMany = jest.fn(
    (args: {
      where: { user_id: { notIn: string[] } };
      take: number;
      cursor?: { channel_id_user_id: { user_id: string } };
    }) => {
      const notIn = new Set(args.where.user_id.notIn);
      const all = subscribers.filter((u) => !notIn.has(u));
      const start = args.cursor
        ? all.indexOf(args.cursor.channel_id_user_id.user_id) + 1
        : 0;
      return Promise.resolve(
        all.slice(start, start + args.take).map((user_id) => ({ user_id })),
      );
    },
  );
  const emitMany = jest.fn().mockResolvedValue(0);
  const runner = new ChannelFanoutRunner(
    { mode: 'api' },
    { get: () => undefined } as unknown as ConfigService,
    { channelSubscription: { findMany } } as unknown as PrismaService,
    {
      hiddenIds: () => Promise.resolve(new Set(['u00003'])),
    } as unknown as BlocksService,
    { emitMany } as unknown as NotificationsService,
    { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
  );
  runner.onApplicationBootstrap(); // no REDIS_URL → inline
  return { runner, findMany, emitMany };
}

const post = {
  channelId: 'ch1',
  channelTitle: 'News',
  channelUsername: 'news',
  postId: 'p1',
  authorId: 'u00000',
};

describe('ChannelFanoutRunner', () => {
  it('notifies every subscriber in batches of 500, one call per batch', async () => {
    const { runner, emitMany } = setup();
    await runner.start(post);
    // 1007 subscribers − the author − one blocked = 1005 → 3 batches.
    expect(emitMany).toHaveBeenCalledTimes(3);
    const sizes = emitMany.mock.calls.map(
      ([a]: [{ recipientIds: string[] }]) => a.recipientIds.length,
    );
    expect(sizes).toEqual([500, 500, 5]);
    const all = emitMany.mock.calls.flatMap(
      ([a]: [{ recipientIds: string[] }]) => a.recipientIds,
    );
    expect(new Set(all).size).toBe(1005);
    expect(all).not.toContain('u00000');
    expect(all).not.toContain('u00003');
    expect(emitMany.mock.calls[0][0]).toMatchObject({
      type: 'channel_post',
      dedupeKey: 'channel_post:p1',
      payload: {
        channelId: 'ch1',
        channelTitle: 'News',
        channelUsername: 'news',
        postId: 'p1',
      },
    });
  });

  it('muted subscribers are skipped by the query', async () => {
    const { runner, findMany } = setup();
    await runner.emitBatch({ ...post, after: null });
    const where = (findMany.mock.calls[0] as [{ where: object }])[0].where;
    expect(where).toMatchObject({ channel_id: 'ch1', muted: false });
  });

  it('a queued batch queues the next one with a job id per cursor', async () => {
    const { runner } = setup();
    const add = jest.fn().mockResolvedValue(undefined);
    (runner as unknown as { queue: unknown }).queue = { add };
    await runner.start(post);
    expect(add).toHaveBeenCalledWith(
      'batch',
      expect.objectContaining({ postId: 'p1', after: null }),
      expect.objectContaining({ jobId: 'p1-start' }),
    );
    await runner.process({ ...post, after: null });
    expect(add).toHaveBeenLastCalledWith(
      'batch',
      expect.objectContaining({ after: 'u00501' }),
      expect.objectContaining({ jobId: 'p1-u00501' }),
    );
  });

  it('a demo post is delivered in the demo world', async () => {
    const { runner, emitMany } = setup();
    const add = jest.fn().mockResolvedValue(undefined);
    (runner as unknown as { queue: unknown }).queue = { add };
    await demoContext.run(true, () => runner.start(post));
    const job = (add.mock.calls[0] as [string, ChannelFanoutJob])[1];
    expect(job.demo).toBe(true);
    let seen: boolean | undefined;
    emitMany.mockImplementation(() => {
      seen = demoContext.isDemo();
      return Promise.resolve(0);
    });
    await runner.process(job);
    expect(seen).toBe(true);
  });
});
