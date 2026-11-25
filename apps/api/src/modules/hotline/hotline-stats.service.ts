import { Injectable, Optional } from '@nestjs/common';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { dailyDue } from '../../common/admin-summary/snapshot-gate';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';

/** The stored copy of GET /admin/hotline/stats (AdminSummaryService key). */
export const HOTLINE_STATS_KEY = 'hotline.stats';

/** How many days the snapshot covers. */
export const HOTLINE_STATS_DAYS = 30;

const DAY_MS = 86_400_000;

/** One UTC day of hotline calls. */
export interface HotlineStatsDay {
  /** YYYY-MM-DD (UTC). */
  day: string;
  calls: number;
  talkSeconds: number;
  /** Calls the client turned into a case («Предложить дело»). */
  casesOffered: number;
  reviews: number;
  /** Sum of the stars of [reviews] (the average = starsSum / reviews). */
  starsSum: number;
  clients: number;
  attorneys: number;
}

export interface HotlineStatsRow {
  key: string;
  calls: number;
}

/** GET /admin/hotline/stats — the nightly snapshot. */
export interface HotlineStats {
  computedAt: string;
  days: HotlineStatsDay[];
  totals: Omit<HotlineStatsDay, 'day'>;
  states: HotlineStatsRow[];
  practices: HotlineStatsRow[];
  /** How the calls ended (`end_reason`), most common first. */
  endReasons: HotlineStatsRow[];
}

type DayRow = {
  day: Date;
  calls: bigint | number;
  talk: bigint | number | null;
  cases: bigint | number;
  reviews: bigint | number;
  stars: bigint | number | null;
  clients: bigint | number;
  attorneys: bigint | number;
};
type KeyRow = { key: string | null; n: bigint | number };

const num = (x: bigint | number | null | undefined) => Number(x ?? 0);

/** Several databases' rows of one key summed and sorted, most first. */
export function mergeRows(parts: KeyRow[][], top = 20): HotlineStatsRow[] {
  const sum = new Map<string, number>();
  for (const r of parts.flat()) {
    const k = r.key ?? '—';
    sum.set(k, (sum.get(k) ?? 0) + num(r.n));
  }
  return [...sum.entries()]
    .map(([key, calls]) => ({ key, calls }))
    .sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key))
    .slice(0, top);
}

/** Every day of the window (empty days as zeros), oldest first. A person in
 * two databases' rows of one day counts in both (the attorney's shard owns
 * the row, so an attorney is never split; a client rarely is). */
export function mergeDays(parts: DayRow[][], now: number): HotlineStatsDay[] {
  const byDay = new Map<string, HotlineStatsDay>();
  const start =
    Math.floor(now / DAY_MS) * DAY_MS - (HOTLINE_STATS_DAYS - 1) * DAY_MS;
  for (let i = 0; i < HOTLINE_STATS_DAYS; i++) {
    const day = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    byDay.set(day, {
      day,
      calls: 0,
      talkSeconds: 0,
      casesOffered: 0,
      reviews: 0,
      starsSum: 0,
      clients: 0,
      attorneys: 0,
    });
  }
  for (const r of parts.flat()) {
    const d = byDay.get(new Date(r.day).toISOString().slice(0, 10));
    if (!d) continue;
    d.calls += num(r.calls);
    d.talkSeconds += num(r.talk);
    d.casesOffered += num(r.cases);
    d.reviews += num(r.reviews);
    d.starsSum += num(r.stars);
    d.clients += num(r.clients);
    d.attorneys += num(r.attorneys);
  }
  return [...byDay.values()];
}

/**
 * Owner rule (admin numbers only from the nightly snapshot) for the hotline:
 * the last 30 days of `hotline_calls` — calls, talk time, cases offered from
 * a call, reviews and stars, people, states, practices, how calls ended —
 * counted once a day by `admin.summaries` (snapshot-gate.ts, 04 UTC) and
 * only READ by the admin page. The live part (who is on the line now,
 * queues) stays GET /admin/hotline/live, from Valkey.
 */
@Injectable()
export class HotlineStatsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {}

  /** The stored snapshot (any age); counted once when nothing is stored. */
  async stats(): Promise<HotlineStats> {
    if (!this.summary) return this.compute();
    const hit = await this.summary.peek<HotlineStats>(HOTLINE_STATS_KEY);
    if (hit) return hit.data;
    return (
      await this.summary.refresh(HOTLINE_STATS_KEY, () => this.compute(), true)
    ).data;
  }

  /** `admin.summaries`: recount when the daily snapshot is due. */
  async refreshDaily(): Promise<void> {
    if (!this.summary) return;
    const hit = await this.summary.peek<HotlineStats>(HOTLINE_STATS_KEY);
    if (dailyDue(hit?.computedAt)) {
      await this.summary.refresh(HOTLINE_STATS_KEY, () => this.compute());
    }
  }

  /** The counts themselves (only the snapshot paths call this). Each query
   * reads one month of the attorney-ordered index range, grouped. */
  async compute(now = Date.now()): Promise<HotlineStats> {
    const since = new Date(
      Math.floor(now / DAY_MS) * DAY_MS - (HOTLINE_STATS_DAYS - 1) * DAY_MS,
    );
    const days = await forEachDatabase(
      this.prisma,
      () => this.prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', answered_at AT TIME ZONE 'UTC') AS day,
               COUNT(*)::bigint AS calls,
               COALESCE(SUM(duration_sec), 0)::bigint AS talk,
               COUNT(case_id)::bigint AS cases,
               COUNT(review_stars)::bigint AS reviews,
               COALESCE(SUM(review_stars), 0)::bigint AS stars,
               COUNT(DISTINCT client_id)::bigint AS clients,
               COUNT(DISTINCT attorney_id)::bigint AS attorneys
          FROM hotline_calls
         WHERE answered_at >= ${since}
         GROUP BY 1`,
      { withPrimary: true },
    );
    const each = (q: () => Promise<KeyRow[]>) =>
      forEachDatabase(this.prisma, q, { withPrimary: true });
    const [states, practices, reasons] = await Promise.all([
      each(
        () => this.prisma.$queryRaw<KeyRow[]>`
          SELECT state_code AS key, COUNT(*)::bigint AS n
            FROM hotline_calls WHERE answered_at >= ${since} GROUP BY 1`,
      ),
      each(
        () => this.prisma.$queryRaw<KeyRow[]>`
          SELECT practice_area AS key, COUNT(*)::bigint AS n
            FROM hotline_calls WHERE answered_at >= ${since} GROUP BY 1`,
      ),
      each(
        () => this.prisma.$queryRaw<KeyRow[]>`
          SELECT end_reason AS key, COUNT(*)::bigint AS n
            FROM hotline_calls WHERE answered_at >= ${since} GROUP BY 1`,
      ),
    ]);
    const list = mergeDays(days, now);
    const totals = list.reduce(
      (t, d) => ({
        calls: t.calls + d.calls,
        talkSeconds: t.talkSeconds + d.talkSeconds,
        casesOffered: t.casesOffered + d.casesOffered,
        reviews: t.reviews + d.reviews,
        starsSum: t.starsSum + d.starsSum,
        // people per day added up = person-days (a month's distinct count
        // would need one more scan; the page says «за день»)
        clients: t.clients + d.clients,
        attorneys: t.attorneys + d.attorneys,
      }),
      {
        calls: 0,
        talkSeconds: 0,
        casesOffered: 0,
        reviews: 0,
        starsSum: 0,
        clients: 0,
        attorneys: 0,
      },
    );
    return {
      computedAt: new Date(now).toISOString(),
      days: list,
      totals,
      states: mergeRows(states),
      practices: mergeRows(practices),
      endReasons: mergeRows(reasons),
    };
  }
}
