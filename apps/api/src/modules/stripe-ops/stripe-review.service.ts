import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma, StripeReviewItem } from '@prisma/client';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import {
  slaDueAt,
  slaState,
  type ReviewKind,
  type ReviewSlaState,
} from './stripe-ops.helpers';

export interface OpenReviewInput {
  kind: ReviewKind;
  /** The Stripe id this item is about (dedupe key together with kind). */
  stripeRef: string;
  summary: string;
  casePaymentId?: string | null;
  userId?: string | null;
  amountCents?: number | null;
  currency?: string;
  details?: Prisma.InputJsonObject;
  /** Stripe's own deadline; otherwise the SLA setting applies. */
  dueAt?: Date | null;
}

export interface ReviewItemView {
  id: string;
  kind: string;
  status: string;
  stripeRef: string;
  casePaymentId: string | null;
  userId: string | null;
  amountCents: number | null;
  currency: string;
  summary: string;
  details: unknown;
  openedAt: Date;
  dueAt: Date | null;
  sla: ReviewSlaState;
  resolvedAt: Date | null;
  resolution: string | null;
}

const STAFF_MAIL_THROTTLE_SECONDS = 1800;

/**
 * Stripe robustness 2026-10-27: the unified review queue — everything from
 * Stripe that needs a human look (failed payouts and refunds, disputes,
 * early fraud warnings, a disconnect, a disabled capability). One row per
 * (kind, Stripe id); a repeat event refreshes the row instead of adding one.
 */
@Injectable()
export class StripeReviewService {
  private readonly logger = new Logger(StripeReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly email?: EmailProvider,
  ) {}

  /** Opens (or refreshes) the item; a closed one is reopened by a new event. */
  async open(input: OpenReviewInput): Promise<StripeReviewItem> {
    const now = new Date();
    const slaHours = await this.settings.number('stripe_ops.review_sla_hours');
    const dueAt = input.dueAt ?? slaDueAt(now, slaHours);
    const existing = await this.prisma.stripeReviewItem.findUnique({
      where: {
        kind_stripe_ref: { kind: input.kind, stripe_ref: input.stripeRef },
      },
    });
    const data = {
      summary: input.summary.slice(0, 300),
      case_payment_id: input.casePaymentId ?? null,
      user_id: input.userId ?? null,
      amount_cents: input.amountCents ?? null,
      currency: input.currency ?? 'usd',
      details: input.details ?? {},
      due_at: dueAt,
    };
    if (existing) {
      const reopen = existing.status !== 'open' && input.kind !== 'dispute';
      return this.prisma.stripeReviewItem.update({
        where: { id: existing.id },
        data: {
          ...data,
          ...(reopen
            ? {
                status: 'open',
                opened_at: now,
                resolved_at: null,
                resolved_by: null,
                resolution: null,
                reminded_at: null,
              }
            : {}),
        },
      });
    }
    const row = await this.prisma.stripeReviewItem.create({
      data: { kind: input.kind, stripe_ref: input.stripeRef, ...data },
    });
    await this.notifyStaff(
      row.id,
      `LawBid Stripe: ${input.kind.replace(/_/g, ' ')}`,
      `${row.summary}\n\nAdmin → Деньги → «Проверки Stripe».`,
    );
    return row;
  }

  /** The system closes an item (a dispute ended, a payout was retried). */
  async closeByRef(
    kind: ReviewKind,
    stripeRef: string,
    resolution: string,
  ): Promise<void> {
    await this.prisma.stripeReviewItem.updateMany({
      where: { kind, stripe_ref: stripeRef, status: 'open' },
      data: {
        status: 'resolved',
        resolved_at: new Date(),
        resolution: resolution.slice(0, 300),
      },
    });
  }

  /** A person closes an item (the admin call has already passed 2FA). */
  async resolve(
    id: string,
    adminId: string,
    status: 'resolved' | 'dismissed',
    resolution: string,
  ): Promise<StripeReviewItem | null> {
    const res = await this.prisma.stripeReviewItem.updateMany({
      where: { id, status: 'open' },
      data: {
        status,
        resolved_at: new Date(),
        resolved_by: adminId,
        resolution: resolution.slice(0, 300),
      },
    });
    if (res.count === 0) return null;
    return this.prisma.stripeReviewItem.findUnique({ where: { id } });
  }

  async get(id: string): Promise<StripeReviewItem | null> {
    return this.prisma.stripeReviewItem.findUnique({ where: { id } });
  }

  async list(q: {
    status?: string;
    kind?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: ReviewItemView[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
    const rows = await this.prisma.stripeReviewItem.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
      },
      // Open items: the most urgent deadline first.
      orderBy: [{ due_at: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const now = new Date();
    return {
      items: page.map((r) => this.view(r, now)),
      nextCursor: rows.length > limit ? (rows[limit]?.id ?? null) : null,
    };
  }

  async counts(): Promise<{
    open: number;
    overdue: number;
    byKind: Record<string, number>;
  }> {
    const open = await this.prisma.stripeReviewItem.findMany({
      where: { status: 'open' },
      select: { kind: true, opened_at: true, due_at: true },
    });
    const now = new Date();
    const byKind: Record<string, number> = {};
    let overdue = 0;
    for (const r of open) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      if (slaState(r.opened_at, r.due_at, now) === 'overdue') overdue += 1;
    }
    return { open: open.length, overdue, byKind };
  }

  view(r: StripeReviewItem, now = new Date()): ReviewItemView {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      stripeRef: r.stripe_ref,
      casePaymentId: r.case_payment_id,
      userId: r.user_id,
      amountCents: r.amount_cents,
      currency: r.currency,
      summary: r.summary,
      details: r.details,
      openedAt: r.opened_at,
      dueAt: r.due_at,
      sla: r.status === 'open' ? slaState(r.opened_at, r.due_at, now) : 'ok',
      resolvedAt: r.resolved_at,
      resolution: r.resolution,
    };
  }

  /** The super admins hear about it by e-mail, at most once per half hour
   * per item (a repeated webhook does not repeat the mail). */
  async notifyStaff(
    throttleKey: string,
    subject: string,
    text: string,
  ): Promise<void> {
    if (!this.email) return;
    try {
      if (!(await this.settings.boolean('stripe_ops.notify_staff'))) return;
      const key = `stripe-ops:mail:${throttleKey}`;
      if (
        (await this.redis.set(
          key,
          '1',
          'EX',
          STAFF_MAIL_THROTTLE_SECONDS,
          'NX',
        )) !== 'OK'
      )
        return;
      const staff = await this.prisma.adminProfile.findMany({
        where: { admin_role: 'super_admin' },
        select: { user_id: true },
      });
      const people = await this.prisma.user.findMany({
        where: { id: { in: staff.map((s) => s.user_id) }, deleted_at: null },
        select: { email: true },
      });
      for (const p of people) {
        if (p.email) await this.email.sendEmail({ to: p.email, subject, text });
      }
    } catch (e) {
      this.logger.warn(`staff alert failed: ${String(e)}`);
    }
  }
}
