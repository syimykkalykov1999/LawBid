import { Injectable } from '@nestjs/common';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { weakEtag } from '../../common/sync/cheap-etag';
import { PrismaService } from '../../prisma/prisma.service';
import { AttorneyTrustService } from '../attorney-trust/attorney-trust.service';
import type { AdminCountsDto } from './admin.dto';

/**
 * Owner 2026-10-22 (client economy plan, package J): the sidebar badges
 * of the admin panel in one light answer — indexed COUNTs — instead of polling the heavy
 * /admin/dashboard aggregate, support stats and trust stats every minute
 * per open tab. The ETag is the counts themselves: unchanged → 304.
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
   * call took 2.4 s. The four counts are shared by the whole team for 30 s
   * (Redis, one refresher; an older value is served at once while it
   * refreshes) instead of four queries per poll per person. */
  async get(): Promise<AdminCountsDto> {
    return (
      await this.summary.get(
        'admin-counts',
        () => this.compute(),
        COUNTS_FRESH_SEC,
      )
    ).data;
  }

  private async compute(): Promise<AdminCountsDto> {
    const [verificationQueue, openReports, supportUnread, trustQueue] =
      await Promise.all([
        this.prisma.verificationRequest.count({
          where: { status: { in: ['submitted', 'in_review'] } },
        }),
        this.prisma.report.count({ where: { status: 'open' } }),
        this.prisma.supportTicket.count({
          where: { unread_by_admin: true, status: { not: 'closed' } },
        }),
        // Owner 2026-10-23: the stored queue size (recounted by the worker);
        // it used to build up to 1000 trust snapshots on every poll.
        this.trust.queueSizeCached(),
      ]);
    return {
      verificationQueue,
      openReports,
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
