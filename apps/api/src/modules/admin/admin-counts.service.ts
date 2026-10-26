import { Injectable } from '@nestjs/common';
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
@Injectable()
export class AdminCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: AttorneyTrustService,
  ) {}

  async get(): Promise<AdminCountsDto> {
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
