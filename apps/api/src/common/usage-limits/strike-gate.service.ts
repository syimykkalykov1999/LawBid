import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { RateLimitService } from '../../modules/auth/services/rate-limit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { ErrorCode } from '../errors/error-code.enum';
import type { LimitedAction } from './usage-limits.service';

export type StrikeLevel = 'none' | 'cooldown' | 'limited' | 'suspended';

export interface StrikeLimit {
  level: StrikeLevel;
  until: string | null;
}

const RANK: Record<StrikeLevel, number> = {
  none: 0,
  cooldown: 1,
  limited: 2,
  suspended: 3,
};

/** New public content: blocked from "limited" up. */
const PUBLISH: ReadonlySet<LimitedAction> = new Set([
  'post_create',
  'post_create_hourly',
  'story_create',
  'channel_create',
  'channel_post',
  'group_create',
  'video_upload',
  'sticker_pack_create',
  'question_create',
  'answer_create',
]);
/** Replies: only blocked when suspended, slowed down by a cooldown. */
const REPLY: ReadonlySet<LimitedAction> = new Set([
  'comment',
  'channel_comment',
]);

const CACHE_SEC = 60;
const cacheKey = (userId: string) => `strike:limit:${userId}`;

/**
 * Owner 2026-10-27: the strike ladder's effect on what a person can do.
 * Called from UsageLimitsService.consume (the one door every posting action
 * already goes through): a cooldown spaces out new posts and comments,
 * "limited" refuses new public content, "suspended" refuses comments too.
 * Messages, calls and the person's own cases are never touched. The result
 * is cached for a minute; StrikesService drops it on every change.
 */
@Injectable()
export class StrikeGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly limiter: RateLimitService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async limit(userId: string): Promise<StrikeLimit> {
    if (!(await this.settings.boolean('moderation.strikes.enabled'))) {
      return { level: 'none', until: null };
    }
    try {
      const hit = await this.redis.get(cacheKey(userId));
      if (hit) return JSON.parse(hit) as StrikeLimit;
    } catch {
      // Redis down: read the database.
    }
    const now = new Date();
    const rows = await this.prisma.userStrike.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        restriction: { not: null },
        restriction_until: { gt: now },
      },
      select: { restriction: true, restriction_until: true },
    });
    let best: StrikeLimit = { level: 'none', until: null };
    for (const r of rows) {
      const level = r.restriction as StrikeLevel;
      const until = r.restriction_until!.toISOString();
      if (
        RANK[level] > RANK[best.level] ||
        (level === best.level && until > (best.until ?? ''))
      ) {
        best = { level, until };
      }
    }
    try {
      await this.redis.set(
        cacheKey(userId),
        JSON.stringify(best),
        'EX',
        CACHE_SEC,
      );
    } catch {
      // best effort
    }
    return best;
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.del(cacheKey(userId));
    } catch {
      // best effort; the cache lives 60 s
    }
  }

  /** Throws 403 / 429 when [action] is not allowed right now. */
  async check(action: LimitedAction, userId: string): Promise<void> {
    const publish = PUBLISH.has(action);
    const reply = REPLY.has(action);
    if (!publish && !reply) return;
    const lim = await this.limit(userId);
    if (lim.level === 'none') return;
    if (lim.level === 'suspended' || (lim.level === 'limited' && publish)) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_STRIKE_LIMITED,
        message:
          'Publishing is limited on this account after moderation decisions. You can appeal in your notices.',
        details: { level: lim.level, until: lim.until },
      });
    }
    // cooldown (and replies while limited): one new post or comment per gap.
    const minutes = await this.settings.number(
      'moderation.strikes.cooldown_minutes',
    );
    if (minutes <= 0) return;
    const r = await this.limiter.consumeFixedWindow(
      ['strike-gap', userId],
      1,
      Math.round(minutes * 60),
    );
    if (!r.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Slow down for now: your account has a posting cooldown.',
          details: {
            action,
            level: lim.level,
            retryAfterSeconds: r.retryAfterSeconds,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
