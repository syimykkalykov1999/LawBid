import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { TRENDING_TAGS_KEY } from './search.provider';
import { tagCategories } from './tag-category';
import { readsAreSplit } from '../../sharding/split-reads';
import { forEachDatabase } from '../../sharding/for-each-database';
import { shardContext } from '../../sharding/shard-context';

const TOP = 20;
/** Outlives several runs, so a missed run never empties the list. */
const TTL_SEC = 24 * 3600;

/** docs/05 §7.2 "Популярные темы": top hashtags of published posts in the
 * last 7 days, into Redis every 10 minutes. */
@Injectable()
export class TrendingTagsJob {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TrendingTagsJob.name);
  }

  async run(now: Date = new Date()): Promise<{ tags: number }> {
    const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const rows = readsAreSplit(this.prisma)
      ? await this.topSplit(since)
      : await this.prisma.$queryRaw<
          { tag: string; n: number; total: number }[]
        >`
      SELECT t.tag_lower AS tag, count(*)::INT8 AS n,
        -- The number shown is the real total of the topic (what its page
        -- lists), the 7-day count only ranks.
        (SELECT count(*) FROM post_tags pt2
           JOIN posts p2 ON p2.id = pt2.post_id
             AND p2.status = 'published' AND p2.deleted_at IS NULL
             AND p2.archived_at IS NULL
           WHERE pt2.tag_id = t.id)::INT8 AS total
      FROM posts p
      JOIN post_tags pt ON pt.post_id = p.id
      JOIN tags t ON t.id = pt.tag_id
      WHERE p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
        AND p.created_at > ${since}
        AND t.tag_lower NOT LIKE '~%'
      GROUP BY t.tag_lower, t.id
      ORDER BY n DESC, tag
      LIMIT ${TOP}`;
    const categories = await tagCategories(
      this.prisma,
      rows.map((r) => r.tag),
    );
    await this.redis.set(
      TRENDING_TAGS_KEY,
      JSON.stringify(
        rows.map((r) => ({
          tag: r.tag,
          postsCount: Number(r.total),
          categoryCode: categories.get(r.tag) ?? null,
        })),
      ),
      'EX',
      TTL_SEC,
    );
    this.logger.info({ tags: rows.length }, 'trending tags rebuilt');
    return { tags: rows.length };
  }

  /** Two databases (SHARDING_READY step 8): the same top, put together from
   * every database (posts + post_tags live with the author); tag names on the
   * primary (global). */
  private async topSplit(
    since: Date,
  ): Promise<{ tag: string; n: number; total: number }[]> {
    const recent = new Map<string, number>();
    for (const rows of await forEachDatabase(
      this.prisma,
      () =>
        this.prisma.$queryRaw<{ id: string; n: bigint }[]>`
        SELECT pt.tag_id::TEXT AS id, count(*) AS n
        FROM posts p JOIN post_tags pt ON pt.post_id = p.id
        WHERE p.status = 'published' AND p.deleted_at IS NULL
          AND p.archived_at IS NULL AND p.created_at > ${since}
        GROUP BY pt.tag_id`,
    )) {
      for (const r of rows)
        recent.set(r.id, (recent.get(r.id) ?? 0) + Number(r.n));
    }
    if (recent.size === 0) return [];
    const names = new Map(
      (
        await shardContext.runOnPrimary(
          () => this.prisma.$queryRaw<{ id: string; tag: string }[]>`
            SELECT id::TEXT AS id, tag_lower AS tag FROM tags
            WHERE id = ANY(${[...recent.keys()]}::UUID[])
              AND tag_lower NOT LIKE '~%'`,
        )
      ).map((r) => [r.id, r.tag] as const),
    );
    const top = [...recent]
      .filter(([id]) => names.has(id))
      .map(([id, n]) => ({ id, tag: names.get(id)!, n }))
      .sort((a, b) => b.n - a.n || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
      .slice(0, TOP);
    const total = new Map<string, number>();
    for (const rows of await forEachDatabase(
      this.prisma,
      () =>
        this.prisma.$queryRaw<{ id: string; n: bigint }[]>`
        SELECT pt.tag_id::TEXT AS id, count(*) AS n
        FROM post_tags pt JOIN posts p ON p.id = pt.post_id
          AND p.status = 'published' AND p.deleted_at IS NULL
          AND p.archived_at IS NULL
        WHERE pt.tag_id = ANY(${top.map((t) => t.id)}::UUID[])
        GROUP BY pt.tag_id`,
    )) {
      for (const r of rows)
        total.set(r.id, (total.get(r.id) ?? 0) + Number(r.n));
    }
    return top.map((t) => ({
      tag: t.tag,
      n: t.n,
      total: total.get(t.id) ?? 0,
    }));
  }
}
