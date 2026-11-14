import { Injectable } from '@nestjs/common';
import type { BillingDisputeRefund } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { DisputeRefundService } from '../billing/dispute-refund.service';
import type {
  AdminDisputeRefundDto,
  AdminDisputeRefundsQueryDto,
} from './admin-billing.dto';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  type Page,
  toPage,
  usersById,
} from './admin-billing.util';

/** R-237 (owner 2026-11-05): «Возвраты по спорам» — every bank inquiry the
 * system refunded by itself or held for a person, newest first. */
@Injectable()
export class DisputeRefundsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: DisputeRefundService,
    private readonly audit: AuditLogService,
  ) {}

  async list(
    q: AdminDisputeRefundsQueryDto,
  ): Promise<Page<AdminDisputeRefundDto>> {
    const rows = await this.prisma.billingDisputeRefund.findMany({
      where: {
        AND: [q.status ? { status: q.status } : {}, afterCursor(q.cursor)],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const users = await usersById(
      this.prisma,
      rows.slice(0, ADMIN_BILLING_PAGE).map((r) => r.user_id),
    );
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => this.view(r, users));
  }

  async approve(admin: AdminActor, id: string): Promise<AdminDisputeRefundDto> {
    const row = await this.refunds.approve(id, admin.id);
    return this.decided(admin, row, 'approve');
  }

  async reject(
    admin: AdminActor,
    id: string,
    note: string,
  ): Promise<AdminDisputeRefundDto> {
    const row = await this.refunds.reject(id, admin.id, note);
    return this.decided(admin, row, 'reject');
  }

  private async decided(
    admin: AdminActor,
    row: BillingDisputeRefund,
    action: 'approve' | 'reject',
  ): Promise<AdminDisputeRefundDto> {
    await this.audit.record({
      adminId: admin.id,
      action: `billing.dispute_refund.${action}`,
      targetType: 'billing_dispute_refund',
      targetId: row.id,
      after: {
        disputeId: row.dispute_id,
        status: row.status,
        reason: row.reason,
        amountCents: row.amount_cents,
        note: row.note,
      },
      ip: admin.ip,
    });
    return this.view(row, await usersById(this.prisma, [row.user_id]));
  }

  private view(
    r: BillingDisputeRefund,
    users: Awaited<ReturnType<typeof usersById>>,
  ): AdminDisputeRefundDto {
    return {
      id: r.id,
      disputeId: r.dispute_id,
      userId: r.user_id,
      user: users.get(r.user_id) ?? null,
      paymentId: r.payment_id,
      status: r.status as AdminDisputeRefundDto['status'],
      reason: r.reason,
      amountCents: r.amount_cents,
      currency: r.currency,
      refundId: r.refund_id,
      note: r.note,
      createdAt: r.created_at.toISOString(),
    };
  }
}
