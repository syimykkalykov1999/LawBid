import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { SubscriptionAlertsService } from '../../modules/notifications/subscription-alerts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { shardContext } from '../../sharding/shard-context';
import { withJobLock } from './job-lock';

const HOUR_MS = 3_600_000;
/** Hourly job: the lock outlives one run. */
const LOCK_TTL_MS = 55 * 60 * 1000;
/** At most this many cases per stage and run (the audience query each). */
export const REBROADCAST_BATCH = 200;

export interface CaseRebroadcastResult {
  ran: boolean;
  queued: number;
}

/**
 * Algo audit 2026-10-27 (CASES M-3): a case with no offers N hours after it
 * was published (`case_alerts.rebroadcast_first_hours`, default 24, and
 * `…_second_hours`, default 72; 0 = that stage off) gets one more alert
 * round — to the people in its audience who were NOT alerted yet (newly
 * verified attorneys, people who turned «Новые дела» on later, those over
 * the daily cap or beyond the last wave). Nobody hears about the same case
 * twice: the round keeps the case's dedupe key (CaseFanoutService,
 * `mode: 'rebroadcast'`).
 *
 * Hourly. A stage takes the cases whose age crossed it within the last two
 * hours (one missed run is caught up); a Redis claim per case and stage
 * keeps the second look from queuing it again. Only open, unpaused cases
 * with zero offers; the index `cases_status_created_at_id_idx` serves the
 * scan. Off: `case_alerts.rebroadcast_enabled`.
 */
@Injectable()
export class CaseRebroadcastJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SubscriptionAlertsService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(CaseRebroadcastJob.name);
  }

  private async bool(key: 'case_alerts.rebroadcast_enabled'): Promise<boolean> {
    return this.settings ? this.settings.boolean(key) : APP_SETTINGS[key];
  }

  private async hours(
    key:
      | 'case_alerts.rebroadcast_first_hours'
      | 'case_alerts.rebroadcast_second_hours',
  ): Promise<number> {
    const v = this.settings
      ? await this.settings.number(key)
      : APP_SETTINGS[key];
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }

  async run(now: Date = new Date()): Promise<CaseRebroadcastResult> {
    if (!(await this.bool('case_alerts.rebroadcast_enabled'))) {
      return { ran: false, queued: 0 };
    }
    const stages = [
      ...new Set(
        [
          await this.hours('case_alerts.rebroadcast_first_hours'),
          await this.hours('case_alerts.rebroadcast_second_hours'),
        ].filter((h) => h > 0),
      ),
    ];
    if (stages.length === 0) return { ran: false, queued: 0 };
    const queued = await withJobLock(
      this.redis,
      'cases.rebroadcast',
      LOCK_TTL_MS,
      async () => {
        let n = 0;
        for (const h of stages) n += await this.stage(h, now);
        return n;
      },
    );
    this.logger.info({ queued }, 'case re-broadcast');
    return { ran: queued !== null, queued: queued ?? 0 };
  }

  /** The cases that crossed [h] hours in the last two hours. */
  private async stage(h: number, now: Date): Promise<number> {
    const newest = new Date(now.getTime() - h * HOUR_MS);
    const oldest = new Date(newest.getTime() - 2 * HOUR_MS);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id::TEXT AS id
      FROM cases
      WHERE status = 'open' AND deleted_at IS NULL AND paused_at IS NULL
        AND bids_count = 0
        AND created_at > ${oldest} AND created_at <= ${newest}
      ORDER BY created_at DESC, id DESC
      LIMIT ${REBROADCAST_BATCH}`);
    let queued = 0;
    for (const r of rows) {
      const claimed = await this.redis.set(
        `case-rebroadcast:${r.id}:${h}h`,
        '1',
        'PX',
        4 * HOUR_MS,
        'NX',
      );
      if (claimed !== 'OK') continue;
      try {
        // The case's own shard (two-database mode), like a webhook.
        await shardContext.runForCase(r.id, () =>
          this.alerts.rebroadcast(r.id, `${h}h`),
        );
        queued += 1;
      } catch (error) {
        this.logger.error(
          {
            job: 'cases.rebroadcast',
            caseId: r.id,
            err: error instanceof Error ? error.message : String(error),
          },
          'case re-broadcast failed; skipped',
        );
      }
    }
    return queued;
  }
}
