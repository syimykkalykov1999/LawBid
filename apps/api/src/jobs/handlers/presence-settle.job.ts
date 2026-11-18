import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  PRESENCE_SETTLED_CHANNEL,
  settleHeldOffline,
  type PresenceSettledMessage,
} from '../../common/presence/live-presence';

/**
 * Verify 5b (C4, 17.11): the delayed `presence.settle` job. The API that saw
 * a person's last connection drop holds their "offline" back for
 * `realtime.server.presence_offline_grace_seconds` and queues this job with
 * the hold's token (ONE_OFF_JOBS). It used to be only an in-process timer,
 * so a crashed / killed API never settled: the watchers kept "online" and
 * `last_active_at` was never written. Now whichever process runs the job
 * settles it: only while the hold is still this token's (compare-and-delete;
 * a reconnect deletes it, a newer drop writes a new token) and the person
 * has no live connection anywhere. The announce goes over
 * PRESENCE_SETTLED_CHANNEL: each API instance tells its own watching
 * sockets after the per-watcher "last seen" check (RealtimeGateway).
 */
@Injectable()
export class PresenceSettleJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async run(data: unknown): Promise<{ settled: boolean; reason?: string }> {
    const d = (data ?? {}) as {
      userId?: unknown;
      token?: unknown;
      leftAt?: unknown;
    };
    if (typeof d.userId !== 'string' || typeof d.token !== 'string') {
      return { settled: false, reason: 'bad data' };
    }
    const leftAt =
      typeof d.leftAt === 'string' && !Number.isNaN(Date.parse(d.leftAt))
        ? new Date(d.leftAt)
        : new Date();
    const settled = await settleHeldOffline(
      this.redis,
      this.prisma.user,
      d.userId,
      leftAt,
      d.token,
    );
    if (!settled) return { settled: false, reason: 'back or settled' };
    const u = await this.prisma.user.findUnique({
      where: { id: d.userId },
      select: { show_activity_status: true },
    });
    if (u?.show_activity_status) {
      const msg: PresenceSettledMessage = {
        userId: d.userId,
        leftAt: leftAt.toISOString(),
      };
      try {
        await this.redis.publish(PRESENCE_SETTLED_CHANNEL, JSON.stringify(msg));
      } catch {
        // Best effort: `last_active_at` is written; a watcher re-reads it on
        // its next `presence:watch`.
      }
    }
    return { settled: true };
  }
}
