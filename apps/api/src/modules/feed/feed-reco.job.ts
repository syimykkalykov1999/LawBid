import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RECO_CURRENT_KEY, recoKey } from './feed.service';

/** §2.2.2: top-N recommendations, recomputed every 10 minutes. */
export const RECO_TOP_N = 1000;
/** A snapshot outlives several recomputes so open cursors keep paging. */
const SNAPSHOT_TTL_SEC = 60 * 60;

/**
 * docs/05 §2.2.2: posts of the last 14 days scored
 * (likes + 2·comments + 2·saves) / (age_hours + 2)^1.5; the top N go into
 * a new versioned ZSET and the "current" pointer moves to it.
 */
@Injectable()
export class FeedRecoJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FeedRecoJob.name);
  }

  async run(
    now: Date = new Date(),
  ): Promise<{ posts: number; version: string }> {
    const since = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    const rows = await this.prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT p.id::STRING AS id,
             (p.like_count + 2 * p.comment_count + 2 * p.save_count)::FLOAT8
               / power(GREATEST(EXTRACT(EPOCH FROM (${now}::TIMESTAMPTZ - p.created_at)) / 3600, 0) + 2, 1.5)
               AS score
      FROM posts AS p
      JOIN users AS u ON u.id = p.author_id AND u.status = 'active'
      JOIN attorney_profiles AS a ON a.user_id = p.author_id
        AND a.verification_status <> 'suspended'
      WHERE p.status = 'published' AND p.deleted_at IS NULL
        AND p.created_at > ${since}
      ORDER BY score DESC, p.created_at DESC
      LIMIT ${RECO_TOP_N}`;
    const version = `${now.getTime()}`;
    if (rows.length > 0) {
      const tx = this.redis.multi();
      tx.zadd(recoKey(version), ...rows.flatMap((r) => [r.score, r.id]));
      tx.expire(recoKey(version), SNAPSHOT_TTL_SEC);
      tx.set(RECO_CURRENT_KEY, version);
      await tx.exec();
    }
    this.logger.info(
      { posts: rows.length, version },
      'feed recommendations rebuilt',
    );
    return { posts: rows.length, version };
  }
}
