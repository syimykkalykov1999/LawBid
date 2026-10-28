import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { recoCurrentKey, recoKey } from './feed.service';
import {} from '../../redis/redis-cluster-safe';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';

/** §2.2.2: top-N recommendations, recomputed every 10 minutes. */
export const RECO_TOP_N = 1000;
/** A snapshot outlives several recomputes so open cursors keep paging. */
const SNAPSHOT_TTL_SEC = 60 * 60;

/**
 * Algo audit 2026-10-27 (CONTENT H-5): where the exploration posts sit in
 * the ranking. Exploration post j of n takes (just under) the score of the
 * ranked row at the matching even spot, so they are spread through the
 * snapshot instead of all at its bottom. Pure, for the spec.
 */
export function exploreScores(ranked: number[], n: number): number[] {
  if (n <= 0) return [];
  if (ranked.length === 0) return Array.from({ length: n }, () => 0);
  return Array.from({ length: n }, (_, j) => {
    const at = Math.min(
      ranked.length - 1,
      Math.floor(((j + 1) * ranked.length) / (n + 1)),
    );
    return ranked[at] * (1 - 1e-9);
  });
}

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
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(FeedRecoJob.name);
  }

  private async num(
    key: 'feed.reco_explore_slots' | 'feed.reco_explore_hours',
    max: number,
  ): Promise<number> {
    let v: number = APP_SETTINGS[key];
    try {
      if (this.settings) v = await this.settings.number(key);
    } catch {
      // settings unreadable: the built-in default
    }
    return Math.min(max, Math.max(0, Math.floor(v)));
  }

  async run(
    now: Date = new Date(),
  ): Promise<{ posts: number; version: string }> {
    const since = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    // CONTENT H-5: a share of the snapshot for fresh posts nobody reacted to
    // yet (score 0) — with more than N scored posts in 14 days a new author
    // otherwise never gets a first showing.
    const slots = await this.num('feed.reco_explore_slots', RECO_TOP_N / 2);
    const hours = await this.num('feed.reco_explore_hours', 72);
    const explore = hours > 0 ? slots : 0;
    const top = await this.prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT p.id::TEXT AS id,
             (p.like_count + 2 * p.comment_count + 2 * p.save_count)::FLOAT8
               / power(GREATEST(EXTRACT(EPOCH FROM (${now}::TIMESTAMPTZ - p.created_at)) / 3600, 0) + 2, 1.5)
               AS score
      FROM posts AS p
      JOIN users AS u ON u.id = p.author_id AND u.status = 'active'
        -- OQ-038: clients post too; suspended attorneys never show.
        AND NOT EXISTS (SELECT 1 FROM attorney_profiles sa
          WHERE sa.user_id = p.author_id AND sa.verification_status = 'suspended')
      WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
        AND p.created_at > ${since}
      ORDER BY score DESC, p.created_at DESC
      LIMIT ${RECO_TOP_N}`;
    let rows = top;
    if (explore > 0) {
      const ranked = top.slice(0, RECO_TOP_N - explore);
      const taken = ranked.map((r) => r.id);
      const fresh = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id::TEXT AS id
        FROM posts AS p
        JOIN users AS u ON u.id = p.author_id AND u.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM attorney_profiles sa
            WHERE sa.user_id = p.author_id AND sa.verification_status = 'suspended')
        WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
          AND p.created_at > ${new Date(now.getTime() - hours * 3600 * 1000)}
          AND p.like_count = 0 AND p.comment_count = 0 AND p.save_count = 0
          AND NOT (p.id = ANY(${taken}::UUID[]))
        ORDER BY p.created_at DESC
        LIMIT ${explore}`;
      // Already in the ranked part, or nothing fresh: the plain top N.
      if (fresh.length > 0) {
        const scores = exploreScores(
          ranked.map((r) => r.score),
          fresh.length,
        );
        rows = [
          ...ranked,
          ...fresh.map((f, i) => ({ id: f.id, score: scores[i] })),
        ];
        // Fill what the fresh ones did not use with the next ranked rows.
        const used = new Set(rows.map((r) => r.id));
        for (const r of top.slice(ranked.length)) {
          if (rows.length >= RECO_TOP_N) break;
          if (!used.has(r.id)) rows.push(r);
        }
      }
    }
    const version = `${now.getTime()}`;
    if (rows.length > 0) {
      const tx = this.redis.multi();
      tx.zadd(recoKey(version), ...rows.flatMap((r) => [r.score, r.id]));
      tx.expire(recoKey(version), SNAPSHOT_TTL_SEC);
      tx.set(recoCurrentKey(), version);
      await tx.exec();
    }
    this.logger.info(
      { posts: rows.length, version },
      'feed recommendations rebuilt',
    );
    return { posts: rows.length, version };
  }
}
