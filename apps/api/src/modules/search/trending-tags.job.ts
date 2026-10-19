import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { TRENDING_TAGS_KEY } from './search.provider';
import { tagCategories } from './tag-category';

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
    const rows = await this.prisma.$queryRaw<
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
}
