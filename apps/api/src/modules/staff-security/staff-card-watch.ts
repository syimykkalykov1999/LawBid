import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { reportDayKey, reportTimeZone } from '../../common/utils/report-day';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ck } from '../../redis/redis-cluster-safe';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { LEASE_KINDS_BY_AREA, type OpenedCard } from './staff-security.util';

/** Redis hash of one report day (row 180 B9: the owner's report time zone,
 * `admin.report_timezone`): field `<adminId>:<counter>`. Three days. A card
 * is counted in the day of the moment it was opened, so across a zone
 * switch every card is in exactly one day. */
export const dayKey = (day: string) => ck('adm', `staff:sec:${day}`);
const DAY_KEEP_SECONDS = 3 * 86_400;

/** The counters the daily detector reads (one row per admin). */
export interface DayCounters {
  opened: number;
  outside: number;
  burst: number;
  reveals: number;
}

/**
 * Staff package T11 (plan C4, the snooping detector): a light Redis
 * counter, no database write on the request path except one indexed lease
 * lookup (only while leases are on). Per admin and report day it counts
 *  - `opened`   cards opened,
 *  - `outside`  cards of a queue section opened without holding the lease,
 *  - `burst`    minutes in which more than `staff.cards_per_minute` cards
 *               were opened,
 *  - `reveals`  full-value reveals.
 * The nightly staff.anomalies job turns the counters into staff_anomalies
 * rows. Nothing here ever blocks or slows a request: errors are swallowed.
 */
@Injectable()
export class StaffCardWatch {
  private readonly logger = new Logger(StaffCardWatch.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    @Optional() private readonly appSettings?: AppSettingsService,
  ) {}

  /** The report day (YYYY-MM-DD) of [at] — the key the counters go to. */
  async today(at: Date = new Date()): Promise<string> {
    return reportDayKey(at, await reportTimeZone(this.appSettings));
  }

  /** A card was opened by [adminId]. Never throws. */
  async noteOpened(adminId: string, card: OpenedCard): Promise<void> {
    try {
      const settings = await this.staff.get();
      const minute = Math.floor(Date.now() / 60_000);
      const minuteKey = ck('adm', `staff:cards:${adminId}:${minute}`);
      const day = dayKey(await this.today());
      const [[, perMinute]] = (await this.redis
        .multi()
        .incr(minuteKey)
        .expire(minuteKey, 120)
        .hincrby(day, `${adminId}:opened`, 1)
        .expire(day, DAY_KEEP_SECONDS)
        .exec()) as [[unknown, number], ...unknown[]];
      const limit = settings.numbers['staff.cards_per_minute'];
      // Once per minute, on the card that crosses the line.
      if (perMinute === limit + 1) {
        await this.redis.hincrby(day, `${adminId}:burst`, 1);
      }
      const kinds = LEASE_KINDS_BY_AREA[card.area];
      if (kinds && settings.switches['staff.lease_enabled']) {
        const held = await this.prisma.workLease.findFirst({
          where: {
            kind: { in: [...kinds] },
            item_id: card.id,
            admin_id: adminId,
            leased_until: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!held) await this.redis.hincrby(day, `${adminId}:outside`, 1);
      }
    } catch (e) {
      this.logger.warn(`card counter failed: ${String(e)}`);
    }
  }

  /** A full-value reveal happened (for the daily report). Never throws. */
  async noteReveal(adminId: string): Promise<void> {
    try {
      const day = dayKey(await this.today());
      await this.redis
        .multi()
        .hincrby(day, `${adminId}:reveals`, 1)
        .expire(day, DAY_KEEP_SECONDS)
        .exec();
    } catch (e) {
      this.logger.warn(`reveal counter failed: ${String(e)}`);
    }
  }

  /** Every admin's counters of [day] (report day `YYYY-MM-DD`). */
  async readDay(day: string): Promise<Map<string, DayCounters>> {
    const raw = await this.redis.hgetall(dayKey(day));
    const out = new Map<string, DayCounters>();
    for (const [field, value] of Object.entries(raw)) {
      const i = field.lastIndexOf(':');
      if (i < 0) continue;
      const id = field.slice(0, i);
      const kind = field.slice(i + 1) as keyof DayCounters;
      if (!['opened', 'outside', 'burst', 'reveals'].includes(kind)) continue;
      const row = out.get(id) ?? {
        opened: 0,
        outside: 0,
        burst: 0,
        reveals: 0,
      };
      row[kind] = Number(value) || 0;
      out.set(id, row);
    }
    return out;
  }
}
