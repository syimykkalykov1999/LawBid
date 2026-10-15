import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { normalizeTerm, SYNONYMS_VERSION_KEY } from './search-synonyms.service';

export type SearchScope = 'people' | 'cases' | 'posts' | 'practices';
export type ClickTarget = 'case' | 'post' | 'attorney' | 'practice';

/** Typing one query leaves one row: a person's own shorter prefixes of a
 * query sent within this window are dropped. */
const TYPING_WINDOW_MS = 8_000;
const KEEP_QUERY_LOG_DAYS = 30;
const KEEP_CLICK_DAYS = 90;
/** A topic is learned from a query when this share of the people who
 * clicked on topic-bound results of that query went to it. */
const LEARN_MIN_SHARE_PERCENT = 30;

/**
 * Owner 2026-10-15: what people search for and open, kept small and cheap:
 * the query log feeds the admin's "no results" list, the clicks feed the
 * nightly "query → topic" learning (plain SQL, no model).
 */
@Injectable()
export class SearchLogService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(SearchLogService.name);
  }

  /** First page of a text search; never blocks or fails the search. */
  logQuery(
    userId: string,
    scope: SearchScope,
    rawQuery: string,
    results: number,
  ): void {
    const q = normalizeTerm(rawQuery).slice(0, 100);
    if (q.length < 3) return;
    void this.writeQuery(userId, scope, q, results).catch((e: unknown) =>
      this.logger.warn({ err: String(e) }, 'search query log skipped'),
    );
  }

  private async writeQuery(
    userId: string,
    scope: SearchScope,
    q: string,
    results: number,
  ): Promise<void> {
    const since = new Date(Date.now() - TYPING_WINDOW_MS);
    await this.prisma.$executeRaw`
      DELETE FROM search_query_log
      WHERE user_id = ${userId}::UUID AND scope = ${scope}
        AND created_at > ${since} AND ${q} LIKE q || '%' AND q <> ${q}`;
    await this.prisma.searchQueryLog.create({
      data: { user_id: userId, q, scope, results },
    });
  }

  /** The person opened a result of a query: one click per person, query
   * and result a day. */
  async recordClick(
    userId: string,
    rawQuery: string,
    targetType: ClickTarget,
    targetId: string,
  ): Promise<void> {
    const q = normalizeTerm(rawQuery).slice(0, 100);
    if (q.length < 3) return;
    const fresh = await this.redis.set(
      `search:click:${userId}:${q}:${targetType}:${targetId}`,
      '1',
      'EX',
      24 * 3600,
      'NX',
    );
    if (!fresh) return;
    const practiceId = await this.practiceOf(targetType, targetId);
    await this.prisma.searchClick.create({
      data: {
        user_id: userId,
        q,
        target_type: targetType,
        target_id: targetId.slice(0, 64),
        practice_area_id: practiceId,
      },
    });
  }

  /** The topic of what was opened (null when it has none). */
  private async practiceOf(
    type: ClickTarget,
    id: string,
  ): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id) && type !== 'practice') return null;
    switch (type) {
      case 'case':
        return (
          (
            await this.prisma.case.findUnique({
              where: { id },
              select: { practice_area_id: true },
            })
          )?.practice_area_id ?? null
        );
      case 'post':
        return (
          (
            await this.prisma.post.findUnique({
              where: { id },
              select: { practice_area_id: true },
            })
          )?.practice_area_id ?? null
        );
      case 'practice':
        return (
          (
            await this.prisma.practiceArea.findUnique({
              where: { code: id },
              select: { id: true },
            })
          )?.id ?? null
        );
      default:
        return null;
    }
  }

  /**
   * Nightly: rebuilds "query → topic" from the clicks (people, not clicks,
   * count, so one person cannot teach the search), then forgets old rows.
   */
  async learn(): Promise<{ links: number }> {
    const minUsers = Math.max(
      2,
      (await this.settings?.number('search.learn_min_users')) ?? 3,
    );
    await this.prisma.$executeRaw`
      WITH per AS (
        SELECT q, practice_area_id, count(DISTINCT user_id)::INT AS users
        FROM search_clicks
        WHERE practice_area_id IS NOT NULL
          AND created_at > now() - make_interval(days => ${KEEP_CLICK_DAYS}::INT)
        GROUP BY q, practice_area_id
      ), tot AS (
        SELECT q, sum(users)::INT AS total FROM per GROUP BY q
      )
      INSERT INTO search_learned_links (q, practice_area_id, score, updated_at)
      SELECT per.q, per.practice_area_id, per.users, now()
      FROM per JOIN tot USING (q)
      WHERE per.users >= ${minUsers}
        AND per.users * 100 >= tot.total * ${LEARN_MIN_SHARE_PERCENT}
      ON CONFLICT (q, practice_area_id)
      DO UPDATE SET score = EXCLUDED.score, updated_at = now()`;
    // Links the clicks no longer support fall away.
    await this.prisma.$executeRaw`
      DELETE FROM search_learned_links
      WHERE updated_at < now() - interval '1 hour'`;
    const links = await this.prisma.searchLearnedLink.count();
    await this.prisma.$executeRaw`
      DELETE FROM search_query_log
      WHERE created_at < now() - make_interval(days => ${KEEP_QUERY_LOG_DAYS}::INT)`;
    await this.prisma.$executeRaw`
      DELETE FROM search_clicks
      WHERE created_at < now() - make_interval(days => ${KEEP_CLICK_DAYS}::INT)`;
    await this.redis.incr(SYNONYMS_VERSION_KEY);
    this.logger.info({ links }, 'search learning rebuilt');
    return { links };
  }
}
