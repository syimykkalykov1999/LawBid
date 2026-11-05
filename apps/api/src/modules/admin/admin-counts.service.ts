import { Injectable } from '@nestjs/common';
import {
  ADMIN_COUNTS_SUMMARY_KEY,
  reportsQueueCountSql,
  reportsQueueWhereSql,
  unreadTicketsWhere,
  verificationQueueWhere,
} from '../../common/admin-queues/admin-queues';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { weakEtag } from '../../common/sync/cheap-etag';
import { PrismaService } from '../../prisma/prisma.service';
import { AttorneyTrustService } from '../attorney-trust/attorney-trust.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { AdminCountsDto } from './admin.dto';

type CountryScope = AdminActor['countries'];

/**
 * Owner 2026-10-22 (client economy plan, package J): the sidebar badges
 * of the admin panel in one light answer — indexed COUNTs — instead of polling the heavy
 * /admin/dashboard aggregate, support stats and trust stats every minute
 * per open tab. The ETag is the counts themselves: unchanged → 304.
 *
 * R-403 (owner 2026-11-04): each count is the number of rows the queue's
 * default list view shows to this admin — the same predicate and the same
 * country scope (common/admin-queues), so a badge «1» over «Очередь пуста»
 * cannot happen again. One shared copy per scope; an action on a queue item
 * drops them all (ADMIN_COUNTS_SUMMARY_KEY).
 */
const COUNTS_FRESH_SEC = 30;

@Injectable()
export class AdminCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: AttorneyTrustService,
    private readonly summary: AdminSummaryService,
  ) {}

  /** Owner 2026-11-02: every staff member polls this once a minute and one
   * call took 2.4 s. The counts are shared by everyone in the same country
   * scope for 30 s (Redis, one refresher; an older value is served at once
   * while it refreshes) instead of four queries per poll per person. */
  async get(countries: CountryScope = null): Promise<AdminCountsDto> {
    return (
      await this.summary.getScoped(
        ADMIN_COUNTS_SUMMARY_KEY,
        countries ? [...countries].sort().join(',') : null,
        () => this.compute(countries),
        COUNTS_FRESH_SEC,
      )
    ).data;
  }

  private async compute(countries: CountryScope): Promise<AdminCountsDto> {
    const [verificationQueue, openReportRows, supportUnread, trustQueue] =
      await Promise.all([
        // «Адвокаты → Все ожидающие»: submitted + needs_more_info with a
        // submission time; a request a verifier took (in_review) is on its
        // own tab, not in the default list, so not in the badge.
        this.prisma.verificationRequest.count({
          where: verificationQueueWhere({}, countries),
        }),
        // «Жалобы → Открытые» is grouped by object: one row per reported
        // object, not one per report.
        this.prisma.$queryRaw<{ n: number }[]>(
          reportsQueueCountSql(reportsQueueWhereSql({}, countries)),
        ),
        this.prisma.supportTicket.count({
          where: unreadTicketsWhere(countries),
        }),
        // Owner 2026-10-23: the stored queue size (recounted by the worker);
        // it used to build up to 1000 trust snapshots on every poll.
        this.trust.queueSizeCached(countries),
      ]);
    return {
      verificationQueue,
      openReports: Number(openReportRows[0]?.n ?? 0),
      supportUnread,
      trustQueue,
    };
  }

  etagOf(c: AdminCountsDto): string {
    return weakEtag(
      'adm',
      c.verificationQueue,
      c.openReports,
      c.supportUnread,
      c.trustQueue,
    );
  }
}
