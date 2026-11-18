import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { reportDayKey, reportTimeZone } from '../../common/utils/report-day';
import { zonedParts } from '../../common/utils/zoned-time';
import { Prisma } from '../../generated/prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { pipeline } from '../../redis/redis-cluster-safe';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { StaffDecisionEvent } from '../staff-core/staff-recorder.port';
import {
  HANDLE_BUCKETS,
  MAX_HANDLE_MS,
  bucketOf,
  percentileFromBuckets,
} from './staff-rating.formulas';

/** Counters live this long in Redis (the daily job reads yesterday's). */
const COUNTER_TTL_SEC = 3 * 24 * 3600;
const READ_CHUNK = 200;
const UPSERT_CHUNK = 500;
/** An outcome is a short word; anything else is not counted by outcome. */
const OUTCOME_RE = /^[a-z_]{1,16}$/;

/** The UTC date of [d]. Owner 14.11 (row 180): the counters themselves are
 * keyed by the report-zone day (`reportDayKey`); this stays for labels. */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
const ctrKey = (day: string, adminId: string) => `staff:ctr:${day}:${adminId}`;
const adminsKey = (day: string) => `staff:ctr-admins:${day}`;
const seenKey = (kind: string, id: string) => `staff:seen:${kind}:${id}`;

/** One admin's counters for one day, read back from Redis. */
export interface DayCounters {
  adminId: string;
  day: string;
  decided: number;
  handleMsSum: number;
  handleN: number;
  buckets: number[];
  /** decisions per UTC hour (24 entries). */
  hours: number[];
  /** decisions per outcome word. */
  outcomes: Record<string, number>;
}

/** The counter-derived columns of staff_daily_stats. */
export interface CounterRow {
  adminId: string;
  day: string;
  decided: number;
  avgHandleSec: number;
  p90HandleSec: number;
}

export function toCounterRow(c: DayCounters): CounterRow {
  return {
    adminId: c.adminId,
    day: c.day,
    decided: c.decided,
    avgHandleSec:
      c.handleN > 0 ? Math.round(c.handleMsSum / c.handleN / 1000) : 0,
    p90HandleSec: percentileFromBuckets(c.buckets, 0.9),
  };
}

/**
 * Staff package T5: Redis counters of the decisions an admin makes. The hot
 * path (a decision) is ONE Redis pipeline of single-key commands, no
 * database; the hourly flush (and the nightly job) write them to
 * staff_daily_stats as ABSOLUTE values (an upsert that sets, never adds), so
 * counting a day twice is harmless.
 */
@Injectable()
export class StaffCountersService {
  private readonly log = new Logger(StaffCountersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    // Owner 14.11 (row 180): a staff day is a day of the report time zone.
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /**
   * Count one decision. Returns true when it was new (the first time this
   * item is reported): the same item reported twice (a retry, or a queue
   * AND the service reporting it) counts once; a later duplicate that
   * carries the handling time the first one lacked adds only the time.
   */
  async bump(e: StaffDecisionEvent, at: Date = new Date()): Promise<boolean> {
    const handle =
      typeof e.handleMs === 'number' && Number.isFinite(e.handleMs)
        ? Math.min(Math.max(0, Math.round(e.handleMs)), MAX_HANDLE_MS)
        : null;
    const tz = await reportTimeZone(this.settings);
    const day = reportDayKey(at, tz);
    // Verify batch 11 (D15c): a decision without its handling time keeps
    // its day and person in the seen-key ('n|<day>|<admin>'), so a late
    // time is booked where the decision was counted, not on the day (or
    // the person) of the duplicate. A bare 'n' is a key of an older build.
    const first = await this.redis.set(
      seenKey(e.itemKind, e.itemId),
      handle === null ? `n|${day}|${e.adminId}` : 't',
      'EX',
      COUNTER_TTL_SEC,
      'NX',
    );
    if (first === null) {
      // Seen. Only a missing handling time can still be added.
      const seen =
        handle === null
          ? null
          : await this.redis.get(seenKey(e.itemKind, e.itemId));
      if (handle !== null && seen !== null && seen.startsWith('n')) {
        const [, seenDay, seenAdmin] = seen.split('|');
        await this.redis.set(
          seenKey(e.itemKind, e.itemId),
          't',
          'EX',
          COUNTER_TTL_SEC,
          'XX',
        );
        await this.addTime(seenDay || day, seenAdmin || e.adminId, handle);
      }
      return false;
    }
    const key = ctrKey(day, e.adminId);
    const p = pipeline(this.redis);
    p.hincrby(key, 'd', 1);
    // Verify batch 11 (D6): the hour of the report time zone, like the day
    // (the night-access rule reads hours 1–5 as the small hours there).
    p.hincrby(key, `hr${zonedParts(at, tz).hour}`, 1);
    if (OUTCOME_RE.test(e.outcome)) p.hincrby(key, `o_${e.outcome}`, 1);
    if (handle !== null) {
      p.hincrby(key, 'h', handle);
      p.hincrby(key, 'n', 1);
      p.hincrby(key, `b${bucketOf(handle)}`, 1);
    }
    p.expire(key, COUNTER_TTL_SEC);
    p.sadd(adminsKey(day), e.adminId);
    p.expire(adminsKey(day), COUNTER_TTL_SEC);
    await p.exec();
    return true;
  }

  private async addTime(day: string, adminId: string, ms: number) {
    const key = ctrKey(day, adminId);
    const p = pipeline(this.redis);
    p.hincrby(key, 'h', ms);
    p.hincrby(key, 'n', 1);
    p.hincrby(key, `b${bucketOf(ms)}`, 1);
    await p.exec();
  }

  /** Every admin's counters of [day] (empty when nothing was counted). */
  async readDay(day: string): Promise<DayCounters[]> {
    const ids = await this.redis.smembers(adminsKey(day));
    const out: DayCounters[] = [];
    for (let i = 0; i < ids.length; i += READ_CHUNK) {
      const part = ids.slice(i, i + READ_CHUNK);
      const p = pipeline(this.redis);
      for (const id of part) p.hgetall(ctrKey(day, id));
      const res = (await p.exec()) ?? [];
      part.forEach((adminId, j) => {
        const h = (res[j]?.[1] ?? {}) as Record<string, string>;
        if (!h.d) return;
        out.push(parseCounters(adminId, day, h));
      });
    }
    return out;
  }

  /** Write [day]'s counters to staff_daily_stats (counter columns only) and
   * return them. Absolute values: running it twice changes nothing. */
  async flushDay(day: string): Promise<DayCounters[]> {
    const counters = await this.readDay(day);
    await this.upsertCounterRows(counters.map(toCounterRow));
    return counters;
  }

  /** The hourly flush: today and yesterday (the job `staff.counters-flush`
   * calls this). Returns the number of rows written. */
  async flushRecent(now: Date = new Date()): Promise<number> {
    const tz = await reportTimeZone(this.settings);
    const today = reportDayKey(now, tz);
    const [y, m, d] = today.split('-').map(Number);
    const days = [
      today,
      new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10),
    ];
    let rows = 0;
    for (const d of days) rows += (await this.flushDay(d)).length;
    return rows;
  }

  private async upsertCounterRows(rows: CounterRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const part = rows.slice(i, i + UPSERT_CHUNK);
      const values = part.map(
        (r) =>
          Prisma.sql`(${r.adminId}::uuid, ${r.day}::date, COALESCE((SELECT workspace FROM admin_profiles WHERE user_id = ${r.adminId}::uuid), 'mass'::admin_workspace), ${r.decided}::int, ${r.avgHandleSec}::int, ${r.p90HandleSec}::int, now())`,
      );
      await this.prisma.$executeRaw`
        INSERT INTO staff_daily_stats
          (admin_id, day, workspace, decided, avg_handle_sec, p90_handle_sec, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (admin_id, day) DO UPDATE SET
          -- Verify batch 11 (D7): the same rule as the nightly upsert — the
          -- counters only grow within a day, so a Redis that lost the hash
          -- (restart mid-day) never lowers what an earlier flush stored.
          avg_handle_sec = CASE WHEN EXCLUDED.decided >= staff_daily_stats.decided AND EXCLUDED.decided > 0
            THEN EXCLUDED.avg_handle_sec ELSE staff_daily_stats.avg_handle_sec END,
          p90_handle_sec = CASE WHEN EXCLUDED.decided >= staff_daily_stats.decided AND EXCLUDED.decided > 0
            THEN EXCLUDED.p90_handle_sec ELSE staff_daily_stats.p90_handle_sec END,
          decided = GREATEST(EXCLUDED.decided, staff_daily_stats.decided),
          updated_at = now()`;
    }
    if (rows.length > 0) {
      this.log.debug(`flushed ${rows.length} staff counter rows`);
    }
  }
}

export function parseCounters(
  adminId: string,
  day: string,
  h: Record<string, string>,
): DayCounters {
  const num = (k: string) => Number(h[k] ?? 0) || 0;
  const outcomes: Record<string, number> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k.startsWith('o_')) outcomes[k.slice(2)] = Number(v) || 0;
  }
  return {
    adminId,
    day,
    decided: num('d'),
    handleMsSum: num('h'),
    handleN: num('n'),
    buckets: Array.from({ length: HANDLE_BUCKETS }, (_, i) => num(`b${i}`)),
    hours: Array.from({ length: 24 }, (_, i) => num(`hr${i}`)),
    outcomes,
  };
}
