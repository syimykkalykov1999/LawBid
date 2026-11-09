import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { adminSummariesDue } from '../../common/admin-summary/summary-cadence';
import { ADMIN_ACTIVE_KEY } from '../../common/ops/admin-activity';
import { OPS_KEYS } from '../../common/ops/ops.constants';
import { triMode } from '../../common/ops/tri-mode';
import { CircuitOpenError } from '../../common/resilience/resilience';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { EconomyService } from '../../common/economy/economy.service';
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import { PromotionsRollupService } from '../../modules/promotions/promotions-rollup.service';
import { BillingOverviewService } from '../../modules/admin-billing/billing-overview.service';
import { AdminAccessReportService } from '../../modules/admin/admin-access-report.service';
import { DashboardService } from '../../modules/admin/dashboard.service';
import {
  AttorneyTrustService,
  TRUST_SCAN_SUMMARY_KEY,
} from '../../modules/attorney-trust/attorney-trust.service';

/** The database (or its breaker) is away, not one count broken (G9):
 * Prisma P1001 «Can't reach database server», P1017 «Server has closed the
 * connection», a pool timeout P2024, or our breaker on the database. */
export function databaseDown(err: unknown): boolean {
  if (err instanceof CircuitOpenError) return /database/i.test(err.service);
  const e = err as { code?: unknown; message?: unknown };
  if (e?.code === 'P1001' || e?.code === 'P1017' || e?.code === 'P2024') {
    return true;
  }
  const text = typeof e?.message === 'string' ? e.message : '';
  return /can't reach database server|server has closed the connection|database#\d+ is failing/i.test(
    text,
  );
}

/** The trust scan reads every attorney: recounted at most this often. */
const TRUST_SCAN_EVERY_MS = 9 * 60_000;

/**
 * Owner 2026-10-23 (admin economy pass): `admin.summaries` — every two
 * minutes the heavy numbers of the admin panel are counted ONCE and stored
 * in Redis (AdminSummaryService): the dashboard totals, the billing
 * overview and the attorney-trust scan (badge statuses + staff queue size,
 * which the sidebar badge reads; that one reads every attorney, so it is
 * recounted every ~10 minutes only). The panel then only reads Redis, however
 * many admins have it open. One failing count never blocks the others.
 */
@Injectable()
export class AdminSummariesJob {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly billing: BillingOverviewService,
    private readonly trust: AttorneyTrustService,
    private readonly summary: AdminSummaryService,
    private readonly analytics: AnalyticsService,
    private readonly logger: PinoLogger,
    // Owner 2026-10-28: this month's admin-access report, once a day.
    @Optional() private readonly accessReport?: AdminAccessReportService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    // Owner 2026-10-27: Boost money by way to pay, recounted every ~6 hours.
    @Optional() private readonly promotions?: PromotionsRollupService,
    // R-369: the «Масштаб» / «Экономика» report (AWS reads) stays warm, so
    // opening the page reads Redis instead of waiting for AWS.
    @Optional() private readonly economy?: EconomyService,
  ) {
    this.logger.setContext(AdminSummariesJob.name);
  }

  /**
   * S20-1: `ops.admin_summaries_mode` Выкл/Вкл/Авто. Авто recounts every
   * 2 minutes only while an admin request was seen in the last 10 minutes,
   * else hourly (see summary-cadence.ts). Without Redis/settings (tests,
   * local) it behaves as Вкл, as before.
   */
  private async due(): Promise<boolean> {
    if (!this.settings || !this.redis) return true;
    try {
      const [mode, active, last] = await Promise.all([
        this.settings.string('ops.admin_summaries_mode'),
        this.redis.exists(ADMIN_ACTIVE_KEY),
        this.redis.get(OPS_KEYS.adminSummariesLast),
      ]);
      return adminSummariesDue({
        mode: triMode(mode),
        adminActive: active === 1,
        lastRunAt: last,
      });
    } catch {
      return true;
    }
  }

  async run(): Promise<{
    refreshed: string[];
    failed: string[];
    skipped?: string;
  }> {
    if (!(await this.due())) {
      return { refreshed: [], failed: [], skipped: 'nobody is looking' };
    }
    await this.redis
      ?.set(OPS_KEYS.adminSummariesLast, new Date().toISOString())
      .catch(() => undefined);
    const steps: [string, () => Promise<void>][] = [
      ['dashboard', () => this.dashboard.refresh()],
      // Owner 2026-10-25: the heavy analytics SQL runs once a day (04 UTC).
      ['analytics', () => this.analytics.refreshSnapshots()],
      ['billing-overview', () => this.billing.refreshOverview()],
      [
        'access-report',
        async () => {
          await this.accessReport?.refreshDaily();
        },
      ],
      [
        'trust-scan',
        async () => {
          const hit = await this.summary.peek(TRUST_SCAN_SUMMARY_KEY);
          if (
            !hit ||
            Date.now() - Date.parse(hit.computedAt) > TRUST_SCAN_EVERY_MS
          )
            await this.trust.refreshScan();
        },
      ],
      [
        'economy-report',
        async () => {
          await this.economy?.report();
        },
      ],
      [
        'promotions-by-model',
        async () => {
          await this.promotions?.refreshIfStale();
        },
      ],
    ];
    const refreshed: string[] = [];
    const failed: string[] = [];
    for (const [i, [name, step]] of steps.entries()) {
      try {
        await step();
        refreshed.push(name);
      } catch (err) {
        const message = (err as Error).message;
        if (databaseDown(err)) {
          // G9 (2026-11-08): on prod all four «refresh failed» lines were the
          // database being away for a moment (the autoscaler changing its
          // size). Every later count would fail the same way: stop the pass,
          // keep the last stored numbers (the panel still shows them), say it
          // once, and clear the stamp so the next tick tries again at once.
          const rest = steps.slice(i).map(([n]) => n);
          failed.push(...rest);
          await this.redis
            ?.del(OPS_KEYS.adminSummariesLast)
            .catch(() => undefined);
          this.logger.info(
            { err: message.slice(0, 200), summary: name, skipped: rest },
            'admin summaries paused: database unreachable, last numbers kept',
          );
          break;
        }
        failed.push(name);
        this.logger.warn(
          { err: message, summary: name },
          'admin summary refresh failed',
        );
      }
    }
    return { refreshed, failed };
  }
}
