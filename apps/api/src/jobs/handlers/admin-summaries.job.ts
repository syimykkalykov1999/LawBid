import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { adminSummariesDue } from '../../common/admin-summary/summary-cadence';
import { ADMIN_ACTIVE_KEY } from '../../common/ops/admin-activity';
import { OPS_KEYS } from '../../common/ops/ops.constants';
import { triMode } from '../../common/ops/tri-mode';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import { PromotionsRollupService } from '../../modules/promotions/promotions-rollup.service';
import { BillingOverviewService } from '../../modules/admin-billing/billing-overview.service';
import { AdminAccessReportService } from '../../modules/admin/admin-access-report.service';
import { DashboardService } from '../../modules/admin/dashboard.service';
import {
  AttorneyTrustService,
  TRUST_SCAN_SUMMARY_KEY,
} from '../../modules/attorney-trust/attorney-trust.service';

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
        'promotions-by-model',
        async () => {
          await this.promotions?.refreshIfStale();
        },
      ],
    ];
    const refreshed: string[] = [];
    const failed: string[] = [];
    for (const [name, step] of steps) {
      try {
        await step();
        refreshed.push(name);
      } catch (err) {
        failed.push(name);
        this.logger.warn(
          { err: (err as Error).message, summary: name },
          'admin summary refresh failed',
        );
      }
    }
    return { refreshed, failed };
  }
}
