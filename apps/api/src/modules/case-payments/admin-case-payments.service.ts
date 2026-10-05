import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import type {
  CasePayment,
  PaymentRequest,
  PayoutAccount,
  Prisma,
} from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { SecretsService } from '../../common/secrets/secrets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  toPage,
  type Page,
} from '../admin-billing/admin-billing.util';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import type {
  AdminCasePaymentRowDto,
  AdminCasePaymentsQueryDto,
  AdminCasePaymentStatsDto,
  AdminPaymentRequestsQueryDto,
  AdminPaymentSettingsDto,
  AdminPaymentSettingsViewDto,
  AdminPayoutAccountActionResultDto,
  AdminPayoutAccountRowDto,
  AdminPayoutAccountsQueryDto,
  AdminRefundCasePaymentDto,
  PaymentRequestDto,
} from './case-payments.dto';
import {
  CasePaymentsService,
  feePayerOf,
  strip,
} from './case-payments.service';
import {
  PAYMENT_SETTINGS_KEY,
  PAYMENTS_FLAG,
  parsePaymentSettings,
  type PaymentSettings,
  type PayoutAccountStatus,
} from './case-payments.settings';

const DAY_MS = 86_400_000;

export const CASE_PAYMENT_AUDIT = {
  settings: 'case_payments.settings',
  refund: 'case_payments.refund',
  syncAccount: 'case_payments.payout_account.sync',
} as const;

/** Owner 2026-10-05: client → attorney payments in the admin
 * (Деньги → Оплаты адвокатам): list + filters, stats, fee settings,
 * attorneys' payout accounts, refunds on the attorney's behalf. */
@Injectable()
export class AdminCasePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: CasePaymentsService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditLogService,
    @Optional() private readonly secrets?: SecretsService,
  ) {}

  async getSettings(): Promise<AdminPaymentSettingsViewDto> {
    const s = await this.payments.settings();
    return this.view(s);
  }

  async updateSettings(
    admin: AdminActor,
    dto: AdminPaymentSettingsDto,
  ): Promise<AdminPaymentSettingsViewDto> {
    const next: PaymentSettings = parsePaymentSettings({
      feeType: dto.feeType,
      feeFixedCents: dto.feeFixedCents,
      feePayer: dto.feePayer,
      processingFeePayer: dto.processingFeePayer,
      processingFeePercent: dto.processingFeePercent,
      processingFeeFixedCents: dto.processingFeeFixedCents,
      minAmountCents: Math.min(dto.minAmountCents, dto.maxAmountCents),
      maxAmountCents: Math.max(dto.minAmountCents, dto.maxAmountCents),
      allowCustomAmount: dto.allowCustomAmount,
      allowPartial: dto.allowPartial,
      refundWindowDays: dto.refundWindowDays,
      saveCards: dto.saveCards,
      allowInvoices: dto.allowInvoices,
      allowInstallments: dto.allowInstallments,
      maxInstallments: dto.maxInstallments,
      feePayerMaxRounds: dto.feePayerMaxRounds,
      invoiceReminderDays: dto.invoiceReminderDays,
      overdueReminderEveryDays: dto.overdueReminderEveryDays,
      invoiceExpireDays: dto.invoiceExpireDays,
      disclaimerEn: dto.disclaimerEn,
      disclaimerRu: dto.disclaimerRu,
    });
    const value = next as unknown as Prisma.InputJsonValue;
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({
        where: { key: PAYMENT_SETTINGS_KEY },
      });
      await tx.appConfig.upsert({
        where: { key: PAYMENT_SETTINGS_KEY },
        create: { key: PAYMENT_SETTINGS_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CASE_PAYMENT_AUDIT.settings,
          targetType: 'app_config',
          targetId: null,
          before: before?.value ?? null,
          after: value,
          ip: admin.ip,
        },
        tx,
      );
    });
    return this.view(next);
  }

  private async view(s: PaymentSettings): Promise<AdminPaymentSettingsViewDto> {
    const [flagEnabled, stripeConfigured] = await Promise.all([
      this.flags.isEnabled(PAYMENTS_FLAG, false),
      this.secrets?.has('stripe') ?? Promise.resolve(false),
    ]);
    return {
      ...s,
      flagEnabled,
      stripeConfigured,
    };
  }

  async list(
    q: AdminCasePaymentsQueryDto,
  ): Promise<Page<AdminCasePaymentRowDto>> {
    const rows = await this.prisma.casePayment.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.caseId ? { case_id: q.caseId } : {}),
        ...(q.userId
          ? { OR: [{ client_id: q.userId }, { attorney_id: q.userId }] }
          : {}),
        ...(q.disputed ? { dispute_status: { not: null } } : {}),
        ...(q.from || q.to
          ? {
              created_at: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
        ...afterCursor(q.cursor),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const presented = await this.presentRows(rows.slice(0, ADMIN_BILLING_PAGE));
    const byId = new Map(presented.map((p) => [p.id, p]));
    return toPage(rows, ADMIN_BILLING_PAGE, (r) => byId.get(r.id)!);
  }

  async get(id: string): Promise<AdminCasePaymentRowDto> {
    const row = await this.prisma.casePayment.findUnique({ where: { id } });
    if (!row) throw notFound();
    const [out] = await this.presentRows([row]);
    return out;
  }

  private async presentRows(
    rows: CasePayment[],
  ): Promise<AdminCasePaymentRowDto[]> {
    if (rows.length === 0) return [];
    const s = await this.payments.settings();
    const [base, refunds] = await Promise.all([
      this.payments.present(rows, s),
      this.prisma.casePaymentRefund.findMany({
        where: { payment_id: { in: rows.map((r) => r.id) } },
        orderBy: { created_at: 'asc' },
      }),
    ]);
    const byPayment = new Map<string, typeof refunds>();
    for (const r of refunds) {
      const list = byPayment.get(r.payment_id) ?? [];
      list.push(r);
      byPayment.set(r.payment_id, list);
    }
    return rows.map((r, i) => ({
      ...base[i],
      stripePaymentIntentId: r.stripe_payment_intent_id,
      stripeAccountId: r.stripe_account_id,
      failureCode: r.failure_code,
      refunds: (byPayment.get(r.id) ?? []).map((x) =>
        this.payments.presentRefund(x),
      ),
    }));
  }

  async stats(now = new Date()): Promise<AdminCasePaymentStatsDto> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const paidStatuses = ['succeeded', 'partially_refunded', 'refunded'];
    const [
      m30,
      all,
      refunded30,
      disputedOpen,
      pending,
      accActive,
      accPending,
      openReq,
      overdueReq,
    ] = await Promise.all([
      this.prisma.casePayment.aggregate({
        where: { status: { in: paidStatuses }, paid_at: { gte: since } },
        _sum: { amount_cents: true, platform_fee_cents: true },
        _count: { _all: true },
      }),
      this.prisma.casePayment.aggregate({
        where: { status: { in: paidStatuses } },
        _sum: { amount_cents: true, platform_fee_cents: true },
      }),
      this.prisma.casePaymentRefund.aggregate({
        where: { status: 'succeeded', created_at: { gte: since } },
        _sum: { amount_cents: true },
      }),
      this.prisma.casePayment.count({
        where: {
          dispute_status: {
            in: [
              'warning_needs_response',
              'needs_response',
              'under_review',
              'warning_under_review',
            ],
          },
        },
      }),
      this.prisma.casePayment.count({
        where: { status: 'pending_payment' },
      }),
      this.prisma.payoutAccount.count({ where: { status: 'active' } }),
      this.prisma.payoutAccount.count({
        where: { status: { in: ['pending', 'onboarding', 'restricted'] } },
      }),
      this.prisma.paymentRequest.aggregate({
        where: { status: 'open' },
        _sum: { amount_cents: true },
        _count: { _all: true },
      }),
      this.prisma.paymentRequest.count({
        where: { status: 'open', due_at: { lt: now } },
      }),
    ]);
    return {
      volume30dCents: m30._sum.amount_cents ?? 0,
      count30d: m30._count._all,
      platformFees30dCents: m30._sum.platform_fee_cents ?? 0,
      refunded30dCents: refunded30._sum.amount_cents ?? 0,
      disputedOpen,
      pendingPayments: pending,
      payoutAccountsActive: accActive,
      payoutAccountsPending: accPending,
      volumeAllCents: all._sum.amount_cents ?? 0,
      platformFeesAllCents: all._sum.platform_fee_cents ?? 0,
      openRequests: openReq._count._all,
      openRequestsCents: openReq._sum.amount_cents ?? 0,
      overdueRequests: overdueReq,
    };
  }

  /** Payment requests (invoices) across the platform, newest first. */
  async listRequests(
    q: AdminPaymentRequestsQueryDto,
  ): Promise<Page<PaymentRequestDto>> {
    const where: Prisma.PaymentRequestWhereInput = {
      AND: [
        q.status ? { status: q.status } : {},
        q.caseId ? { case_id: q.caseId } : {},
        q.userId
          ? { OR: [{ client_id: q.userId }, { attorney_id: q.userId }] }
          : {},
        afterCursor(q.cursor),
      ],
    };
    const rows: PaymentRequest[] = await this.prisma.paymentRequest.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const page = rows.slice(0, ADMIN_BILLING_PAGE);
    const items = await this.payments.presentRequests(page);
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > ADMIN_BILLING_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** The admin gives money back on the attorney's behalf (support case,
   * a dispute settled by hand, …). No refund window here. */
  async refund(
    admin: AdminActor,
    id: string,
    dto: AdminRefundCasePaymentDto,
  ): Promise<AdminCasePaymentRowDto> {
    const row = await this.prisma.casePayment.findUnique({ where: { id } });
    if (!row) throw notFound();
    const updated = await this.payments.refundPayment(row, dto, {
      type: 'admin',
      id: admin.id,
    });
    await this.audit.record({
      adminId: admin.id,
      action: CASE_PAYMENT_AUDIT.refund,
      targetType: 'case_payment',
      targetId: id,
      before: { status: row.status, refunded_cents: row.refunded_cents },
      after: {
        status: updated.status,
        refunded_cents: updated.refunded_cents,
        amount_cents: dto.amountCents ?? null,
      },
      ip: admin.ip,
      justification: dto.reason,
    });
    const [out] = await this.presentRows([updated]);
    return out;
  }

  // ---- payout accounts --------------------------------------------------------------

  async listPayoutAccounts(
    q: AdminPayoutAccountsQueryDto,
  ): Promise<Page<AdminPayoutAccountRowDto>> {
    // payout_accounts is keyed by user_id (no id column): the shared
    // keyset helpers want `id`, so the cursor is built here.
    const c = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.payoutAccount.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, user_id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { user_id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const page = rows.slice(0, ADMIN_BILLING_PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.presentAccounts(page),
      nextCursor:
        rows.length > ADMIN_BILLING_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.user_id })
          : null,
    };
  }

  /** Pull the current state from Stripe (after a support ticket, or when
   * a webhook was missed). */
  async syncPayoutAccount(
    admin: AdminActor,
    userId: string,
  ): Promise<AdminPayoutAccountActionResultDto> {
    const row = await this.prisma.payoutAccount.findUnique({
      where: { user_id: userId },
    });
    if (!row) throw notFound('Payout account not found.');
    const synced =
      (await this.payments.syncAccount(row.stripe_account_id)) ?? row;
    await this.audit.record({
      adminId: admin.id,
      action: CASE_PAYMENT_AUDIT.syncAccount,
      targetType: 'payout_account',
      targetId: userId,
      before: { status: row.status },
      after: { status: synced.status },
      ip: admin.ip,
    });
    const [account] = await this.presentAccounts([synced]);
    return { account };
  }

  private async presentAccounts(
    rows: PayoutAccount[],
  ): Promise<AdminPayoutAccountRowDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.user_id);
    const [parties, received] = await Promise.all([
      this.payments.parties(ids),
      this.prisma.casePayment.groupBy({
        by: ['attorney_id'],
        where: {
          attorney_id: { in: ids },
          status: { in: ['succeeded', 'partially_refunded', 'refunded'] },
        },
        _sum: { amount_cents: true },
      }),
    ]);
    const sums = new Map(
      received.map((r) => [r.attorney_id, r._sum.amount_cents ?? 0]),
    );
    return rows.map((r) => {
      const p = parties.get(r.user_id);
      return {
        userId: r.user_id,
        user: strip(p),
        email: p?.email ?? null,
        stripeAccountId: r.stripe_account_id,
        status: r.status as PayoutAccountStatus,
        chargesEnabled: r.charges_enabled,
        payoutsEnabled: r.payouts_enabled,
        requirementsDue: r.requirements_due,
        disabledReason: r.disabled_reason,
        receivedCents: sums.get(r.user_id) ?? 0,
        processingFeePayer: feePayerOf(r.processing_fee_payer),
        lastSyncedAt: r.last_synced_at?.toISOString() ?? null,
        createdAt: r.created_at.toISOString(),
      };
    });
  }
}

function notFound(message = 'Payment not found.'): NotFoundException {
  return new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
}
