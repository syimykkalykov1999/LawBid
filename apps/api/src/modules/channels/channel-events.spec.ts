import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BlocksService } from '../blocks/blocks.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { ChannelFanoutRunner } from './channel-fanout.runner';

/** Owner 2026-10-22 (client economy plan, package F): a channel post moves
 * the subscribers' list rows through one light `channel:update` per
 * fan-out batch, beside the stored notifications. */
describe('channel fan-out realtime', () => {
  it('emits channel:update to the batch (no body) and nothing without subscribers', async () => {
    const toUsers = jest.fn();
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ user_id: 'u1' }, { user_id: 'u2' }])
      .mockResolvedValueOnce([]);
    const runner = new ChannelFanoutRunner(
      { mode: 'api' },
      { get: () => undefined } as unknown as ConfigService,
      { channelSubscription: { findMany } } as unknown as PrismaService,
      {
        hiddenIds: () => Promise.resolve(new Set()),
      } as unknown as BlocksService,
      {
        emitMany: jest.fn().mockResolvedValue(0),
      } as unknown as NotificationsService,
      { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
      { toUsers } as never,
    );
    const job = {
      channelId: 'c1',
      channelTitle: 'T',
      channelUsername: 'u',
      postId: 'p1',
      authorId: 'a',
    };
    await runner.emitBatch(job);
    expect(toUsers).toHaveBeenCalledTimes(1);
    expect(toUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'channel:update',
      expect.objectContaining({ channelId: 'c1', postId: 'p1' }),
    );
    expect(toUsers.mock.calls[0][2]).not.toHaveProperty('post');
    await runner.emitBatch(job);
    expect(toUsers).toHaveBeenCalledTimes(1);
  });
});
