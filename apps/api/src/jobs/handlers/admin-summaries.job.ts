import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BillingOverviewService } from '../../modules/admin-billing/billing-overview.service';
import { DashboardService } from '../../modules/admin/dashboard.service';
import { AttorneyTrustService } from '../../modules/attorney-trust/attorney-trust.service';

/**
 * Owner 2026-10-23 (admin economy pass): `admin.summaries` — every two
 * minutes the heavy numbers of the admin panel are counted ONCE and stored
 * in Redis (AdminSummaryService): the dashboard totals, the billing
 * overview and the attorney-trust scan (badge statuses + staff queue size,
 * which the sidebar badge reads). The panel then only reads Redis, however
 * many admins have it open. One failing count never blocks the others.
 */
@Injectable()
export class AdminSummariesJob {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly billing: BillingOverviewService,
    private readonly trust: AttorneyTrustService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdminSummariesJob.name);
  }

  async run(): Promise<{ refreshed: string[]; failed: string[] }> {
    const steps: [string, () => Promise<void>][] = [
      ['dashboard', () => this.dashboard.refresh()],
      ['billing-overview', () => this.billing.refreshOverview()],
      ['trust-scan', () => this.trust.refreshScan()],
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
