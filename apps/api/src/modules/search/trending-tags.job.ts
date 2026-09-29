import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { TRENDING_TAGS_KEY } from './search.provider';

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
    const rows = await this.prisma.$queryRaw<{ tag: string; n: number }[]>`
      SELECT t.tag_lower AS tag, count(*)::INT8 AS n
      FROM posts p
      JOIN post_tags pt ON pt.post_id = p.id
      JOIN tags t ON t.id = pt.tag_id
      WHERE p.status = 'published' AND p.deleted_at IS NULL
        AND p.created_at > ${since}
      GROUP BY t.tag_lower
      ORDER BY n DESC, tag
      LIMIT ${TOP}`;
    await this.redis.set(
      TRENDING_TAGS_KEY,
      JSON.stringify(
        rows.map((r) => ({ tag: r.tag, postsCount: Number(r.n) })),
      ),
      'EX',
      TTL_SEC,
    );
    this.logger.info({ tags: rows.length }, 'trending tags rebuilt');
    return { tags: rows.length };
  }
}
