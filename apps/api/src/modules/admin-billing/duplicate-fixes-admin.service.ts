import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminDuplicateFixDto,
  AdminDuplicateFixesQueryDto,
} from './admin-billing.dto';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  type Page,
  toPage,
  usersById,
} from './admin-billing.util';

/** Algo audit M-4 (owner 2026-10-28): «Двойные подписки» — every duplicate
 * subscription the system cancelled / refunded by itself or held for a
 * person, newest first. */
@Injectable()
export class DuplicateFixesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    q: AdminDuplicateFixesQueryDto,
  ): Promise<Page<AdminDuplicateFixDto>> {
    const rows = await this.prisma.billingDuplicateFix.findMany({
      where: {
        AND: [
          q.status ? { status: q.status } : {},
          q.userId ? { user_id: q.userId } : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const users = await usersById(
      this.prisma,
      rows.slice(0, ADMIN_BILLING_PAGE).map((r) => r.user_id),
    );
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => ({
      id: r.id,
      userId: r.user_id,
      user: users.get(r.user_id) ?? null,
      keptSubscriptionId: r.kept_subscription_id,
      duplicateSubscriptionId: r.duplicate_subscription_id,
      trigger: r.trigger,
      status: r.status as AdminDuplicateFixDto['status'],
      reason: r.reason,
      chargedCents: r.charged_cents,
      refundCents: r.refund_cents,
      currency: r.currency,
      refundId: r.refund_id,
      canceledAt: r.canceled_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    }));
  }
}
