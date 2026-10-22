import { Injectable } from '@nestjs/common';
import { weakEtag } from '../../common/sync/cheap-etag';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminApprovalsService } from '../admin-auth/admin-approvals.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AttorneyTrustService } from '../attorney-trust/attorney-trust.service';
import type { AdminCountsDto } from './admin.dto';

/**
 * Owner 2026-10-22 (client economy plan, package J): the sidebar badges
 * of the admin panel in one light answer — four indexed COUNTs and the
 * approvals this admin may decide — instead of polling the heavy
 * /admin/dashboard aggregate, support stats and trust stats every minute
 * per open tab. The ETag is the counts themselves: unchanged → 304.
 */
@Injectable()
export class AdminCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: AdminApprovalsService,
    private readonly trust: AttorneyTrustService,
  ) {}

  async get(admin: AdminActor): Promise<AdminCountsDto> {
    const [
      verificationQueue,
      openReports,
      supportUnread,
      trustQueue,
      approvalsPending,
    ] = await Promise.all([
      this.prisma.verificationRequest.count({
        where: { status: { in: ['submitted', 'in_review'] } },
      }),
      this.prisma.report.count({ where: { status: 'open' } }),
      this.prisma.supportTicket.count({
        where: { unread_by_admin: true, status: { not: 'closed' } },
      }),
      this.trust.queue({ limit: 1000 }).then((q) => q.length),
      this.approvals.pendingCount(admin),
    ]);
    return {
      verificationQueue,
      openReports,
      supportUnread,
      trustQueue,
      approvalsPending,
    };
  }

  etagOf(c: AdminCountsDto): string {
    return weakEtag(
      'adm',
      c.verificationQueue,
      c.openReports,
      c.supportUnread,
      c.trustQueue,
      c.approvalsPending,
    );
  }
}
