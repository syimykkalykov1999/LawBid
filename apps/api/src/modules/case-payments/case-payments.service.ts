import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CasePayment, PayoutAccount, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type {
  PaymentProvider,
  ProviderConnectAccount,
  ProviderConnectedCheckout,
  ProviderEvent,
} from '../billing/payment-provider';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CasePaymentDto,
  CasePaymentPartyDto,
  CasePaymentRefundDto,
  CasePaymentsStateDto,
  CreateCasePaymentDto,
  CreateCasePaymentResultDto,
  MyCasePaymentsQueryDto,
  MyCasePaymentsSummaryDto,
  PaymentQuoteDto,
  PaymentSettingsPublicDto,
  PayoutAccountDto,
  RefundCasePaymentDto,
} from './case-payments.dto';
import {
  PAYMENT_SETTINGS_KEY,
  PAYMENTS_FLAG,
  PENDING_PAYMENT_TTL_MS,
  type PaymentKind,
  type PaymentSettings,
  type PaymentStatus,
  type PayoutAccountStatus,
  parsePaymentSettings,
  quotePayment,
} from './case-payments.settings';

export const CASE_PAYMENT_CHECKOUT_KIND = 'case_payment';
const PAGE = 30;
/** Statuses of a case in which the client may pay the attorney. */
const PAYABLE_CASE_STATUSES = new Set([
  'in_progress',
  'pending_completion',
  'closed',
]);
const PAID_STATUSES: PaymentStatus[] = [
  'succeeded',
  'partially_refunded',
  'disputed',
];
const DAY_MS = 86_400_000;

type Db = Prisma.TransactionClient | PrismaService;

export interface Party extends CasePaymentPartyDto {
  email: string | null;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Payment not found.',
  });
}

function caseNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CASE_NOT_FOUND,
    message: 'Case not found.',
  });
}

function disabled(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.FEATURE_DISABLED,
    message: 'Payments through the platform are not available right now.',
  });
}

function notConfigured(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
    message: 'Payments are not configured on this server.',
  });
}

/** Stripe's account state → ours. */
export function payoutStatusOf(a: ProviderConnectAccount): PayoutAccountStatus {
  if (a.disabledReason && /rejected|listed/.test(a.disabledReason))
    return 'disabled';
  if (a.chargesEnabled && a.payoutsEnabled) return 'active';
  if (!a.detailsSubmitted) return 'onboarding';
  return 'restricted';
}

function isPaid(status: string): boolean {
  return (PAID_STATUSES as string[]).includes(status);
}

/** The part of a refund that falls on the attorney's fee (pro rata). */
function refundedFee(r: {
  amount_cents: number;
  refunded_cents: number;
  client_total_cents: number;
}): number {
  if (r.refunded_cents <= 0) return 0;
  if (r.refunded_cents >= r.client_total_cents) return r.amount_cents;
  return Math.round((r.refunded_cents * r.amount_cents) / r.client_total_cents);
}

export function strip(p: Party | undefined): CasePaymentPartyDto | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    username: p.username,
    avatarUrl: p.avatarUrl,
  };
}

function afterCursor(cursor?: string): Prisma.CasePaymentWhereInput {
  if (!cursor) return {};
  const c = decodeCursor(cursor);
  return {
    OR: [
      { created_at: { lt: c.createdAt } },
      { created_at: c.createdAt, id: { lt: c.id } },
    ],
  };
}

/**
 * Owner 2026-10-05: a client pays the accepted attorney of a case through
 * the platform. Stripe Connect Express: the attorney onboards from the
 * app, the client pays on a hosted Stripe Checkout charged DIRECTLY on
 * the attorney's account (the money never touches the platform's
 * balance), and the platform keeps only `application_fee_amount` as set
 * in the admin (Деньги → Оплаты адвокатам). Refunds come from the
 * attorney (or an admin); disputes are recorded from Stripe's webhooks.
 * Everything is behind the `payments_in_app` flag — an attorney may
 * always be paid outside the platform.
 */
@Injectable()
export class CasePaymentsService {
  private readonly logger = new Logger(CasePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly flags: FeatureFlagsService,
    private readonly files: FilesService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  // ---- settings -------------------------------------------------------------

  async settings(db: Db = this.prisma): Promise<PaymentSettings> {
    const row = await db.appConfig.findUnique({
      where: { key: PAYMENT_SETTINGS_KEY },
    });
    return parsePaymentSettings(row?.value);
  }

  /** The flag — the admin refuses to switch it on without Stripe keys. */
  enabled(): Promise<boolean> {
    return this.flags.isEnabled(PAYMENTS_FLAG, false);
  }

  async publicSettings(): Promise<PaymentSettingsPublicDto> {
    const [enabled, s] = await Promise.all([this.enabled(), this.settings()]);
    return {
      enabled,
      feeType: s.feeType,
      feeFixedCents: s.feeFixedCents,
      feePercent: s.feePercent,
      feePayer: s.feePayer,
      passProcessingFeeToClient: s.passProcessingFeeToClient,
      minAmountCents: s.minAmountCents,
      maxAmountCents: s.maxAmountCents,
      allowCustomAmount: s.allowCustomAmount,
      allowPartial: s.allowPartial,
      refundWindowDays: s.refundWindowDays,
    };
  }

  async quote(amountCents: number): Promise<PaymentQuoteDto> {
    const s = await this.settings();
    this.assertAmount(amountCents, s);
    return quotePayment(amountCents, s);
  }

  /**
   * Seam for the plan builder (thread "Конструктор подписок и
   * преимуществ"): whether this attorney's plan includes receiving
   * payments through the platform. Until plans carry the entitlement,
   * every attorney may once the feature is on.
   */
  attorneyEntitled(attorneyId: string): Promise<boolean> {
    void attorneyId;
    return Promise.resolve(true);
  }

  // ---- payout account (attorney) ---------------------------------------------

  async payoutAccount(user: RequestUser): Promise<PayoutAccountDto> {
    this.assertAttorney(user);
    const row = await this.prisma.payoutAccount.findUnique({
      where: { user_id: user.sub },
    });
    // Back from Stripe's onboarding: re-read the account once.
    const fresh =
      row && row.status !== 'active' && this.provider?.retrieveConnectAccount
        ? await this.syncAccount(row.stripe_account_id).catch(() => row)
        : row;
    return this.presentPayoutAccount(fresh, await this.enabled());
  }

  /** Creates the Express account on first call; returns the hosted
   * onboarding link (short-lived, open in a browser). */
  async startOnboarding(user: RequestUser): Promise<{ url: string }> {
    this.assertAttorney(user);
    this.assertNotAssistant(user);
    if (!(await this.enabled())) throw disabled();
    if (!(await this.attorneyEntitled(user.sub))) throw disabled();
    if (
      !this.provider?.createConnectAccount ||
      !this.provider.createAccountOnboardingLink
    ) {
      throw notConfigured();
    }
    let row = await this.prisma.payoutAccount.findUnique({
      where: { user_id: user.sub },
    });
    if (!row) {
      const u = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { email: true },
      });
      const accountId = await this.provider.createConnectAccount({
        userId: user.sub,
        email: u?.email ?? null,
        country: 'US',
      });
      row = await this.prisma.payoutAccount.upsert({
        where: { user_id: user.sub },
        create: {
          user_id: user.sub,
          stripe_account_id: accountId,
          status: 'onboarding',
          country: 'US',
        },
        update: {},
      });
    }
    const base = this.appLinkBase();
    const url = await this.provider.createAccountOnboardingLink({
      accountId: row.stripe_account_id,
      refreshUrl: `${base}/payout/refresh`,
      returnUrl: `${base}/payout/return`,
    });
    if (row.status === 'pending') {
      await this.prisma.payoutAccount.update({
        where: { user_id: user.sub },
        data: { status: 'onboarding' },
      });
    }
    return { url };
  }

  /** The Express dashboard (balance, payouts, bank account). */
  async dashboardLink(user: RequestUser): Promise<{ url: string }> {
    this.assertAttorney(user);
    this.assertNotAssistant(user);
    const row = await this.prisma.payoutAccount.findUnique({
      where: { user_id: user.sub },
    });
    if (!row) throw notFound();
    if (!this.provider?.createAccountLoginLink) throw notConfigured();
    return {
      url: await this.provider.createAccountLoginLink(row.stripe_account_id),
    };
  }

  /** Re-read the connected account from Stripe and store its state;
   * notifies the attorney when it becomes usable / blocked. */
  async syncAccount(accountId: string): Promise<PayoutAccount | null> {
    const row = await this.prisma.payoutAccount.findUnique({
      where: { stripe_account_id: accountId },
    });
    if (!row || !this.provider?.retrieveConnectAccount) return row;
    const remote = await this.provider.retrieveConnectAccount(accountId);
    if (!remote) return row;
    const status = payoutStatusOf(remote);
    const updated = await this.prisma.payoutAccount.update({
      where: { stripe_account_id: accountId },
      data: {
        status,
        charges_enabled: remote.chargesEnabled,
        payouts_enabled: remote.payoutsEnabled,
        details_submitted: remote.detailsSubmitted,
        requirements_due: remote.requirementsDue,
        disabled_reason: remote.disabledReason,
        country: remote.country ?? row.country,
        last_synced_at: new Date(),
      },
    });
    if (status !== row.status && status !== 'onboarding') {
      await this.notify(row.user_id, 'payout_account_status', { status });
    }
    return updated;
  }

  // ---- case payments -----------------------------------------------------------

  /** `GET /cases/:id/payments` for the client or the accepted attorney. */
  async caseState(
    user: RequestUser,
    caseId: string,
  ): Promise<CasePaymentsStateDto> {
    const { kase, side, attorneyId } = await this.caseSide(user, caseId);
    const [enabled, s] = await Promise.all([this.enabled(), this.settings()]);
    let rows = await this.caseRows(caseId);
    // Back from the browser before the webhook: check the open session.
    const open = rows.find(
      (p) =>
        p.status === 'pending_payment' &&
        p.stripe_checkout_id &&
        p.stripe_account_id,
    );
    if (
      open?.stripe_checkout_id &&
      open.stripe_account_id &&
      (await this.applyCheckoutById(
        open.stripe_checkout_id,
        open.stripe_account_id,
      ))
    ) {
      rows = await this.caseRows(caseId);
    }
    const account = attorneyId
      ? await this.prisma.payoutAccount.findUnique({
          where: { user_id: attorneyId },
        })
      : null;
    const attorneyReady =
      !!account && account.status === 'active' && account.charges_enabled;
    const bidAmountCents = fixedBidAmount(kase.accepted_bid);
    const paidCents = rows
      .filter((r) => isPaid(r.status))
      .reduce((sum, r) => sum + r.amount_cents - refundedFee(r), 0);
    const refundedCents = rows.reduce((sum, r) => sum + r.refunded_cents, 0);
    const remainingCents =
      bidAmountCents === null ? null : Math.max(0, bidAmountCents - paidCents);
    const canPay =
      enabled &&
      side === 'client' &&
      attorneyReady &&
      PAYABLE_CASE_STATUSES.has(kase.status) &&
      (await this.attorneyEntitled(attorneyId ?? ''));
    return {
      enabled,
      attorneyReady,
      canPay,
      bidAmountCents,
      paidCents,
      refundedCents,
      remainingCents,
      minAmountCents: s.minAmountCents,
      maxAmountCents: s.maxAmountCents,
      allowCustomAmount: s.allowCustomAmount,
      allowPartial: s.allowPartial,
      items: await this.present(rows, s),
    };
  }

  /** `POST /cases/:id/payments` — the client starts a payment; returns
   * the Stripe page to open. */
  async create(
    user: RequestUser,
    caseId: string,
    dto: CreateCasePaymentDto,
  ): Promise<CreateCasePaymentResultDto> {
    if (!(await this.enabled())) throw disabled();
    const { kase, side, attorneyId } = await this.caseSide(user, caseId);
    if (side !== 'client' || !attorneyId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the client of this case can pay.',
      });
    }
    if (!PAYABLE_CASE_STATUSES.has(kase.status)) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message:
          'Payments are possible once the attorney is at work on the case.',
      });
    }
    if (!(await this.attorneyEntitled(attorneyId))) throw disabled();
    const account = await this.prisma.payoutAccount.findUnique({
      where: { user_id: attorneyId },
    });
    if (!account || account.status !== 'active' || !account.charges_enabled) {
      throw new ConflictException({
        code: ErrorCode.PAYOUT_ACCOUNT_NOT_READY,
        message:
          'This attorney has not connected a payout account yet. Pay them directly or ask them to connect one in the app.',
      });
    }
    if (!this.provider?.createConnectedCheckout) throw notConfigured();
    const s = await this.settings();
    const bid = kase.accepted_bid;
    const amountCents = await this.amountFor(
      dto,
      s,
      caseId,
      fixedBidAmount(bid),
    );
    const quote = quotePayment(amountCents, s);

    const row = await withTxRetry(this.prisma, async (tx) => {
      // An earlier unpaid checkout on this case is superseded.
      await tx.casePayment.updateMany({
        where: {
          case_id: caseId,
          client_id: user.sub,
          status: 'pending_payment',
        },
        data: { status: 'canceled', canceled_reason: 'superseded' },
      });
      return tx.casePayment.create({
        data: {
          case_id: caseId,
          bid_id: bid?.id ?? null,
          client_id: user.sub,
          attorney_id: attorneyId,
          kind: dto.kind,
          status: 'pending_payment',
          amount_cents: quote.amountCents,
          platform_fee_cents: quote.platformFeeCents,
          processing_fee_cents: quote.processingFeeCents,
          client_total_cents: quote.clientTotalCents,
          attorney_net_cents: quote.attorneyNetCents,
          fee_type: quote.feeType,
          fee_payer: quote.feePayer,
          note: dto.note?.trim() || null,
          stripe_account_id: account.stripe_account_id,
        },
      });
    });

    let session: { id: string; url: string };
    try {
      const client = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { email: true },
      });
      const base = this.appLinkBase();
      session = await this.provider.createConnectedCheckout({
        accountId: account.stripe_account_id,
        customerEmail: client?.email ?? null,
        amountCents: quote.clientTotalCents,
        // Only the platform's own fee; the processing estimate stays on
        // the attorney's balance, where Stripe takes its real fee.
        applicationFeeCents: quote.platformFeeCents,
        description: `LawBid — ${kase.title.slice(0, 80)}`,
        metadata: {
          kind: CASE_PAYMENT_CHECKOUT_KIND,
          paymentId: row.id,
          caseId,
          userId: user.sub,
          attorneyId,
        },
        successUrl: `${base}/payment/success?payment_id=${row.id}&case_id=${caseId}`,
        cancelUrl: `${base}/payment/cancel?payment_id=${row.id}&case_id=${caseId}`,
        idempotencyKey: `case-payment:${row.id}`,
      });
    } catch (e) {
      await this.prisma.casePayment.updateMany({
        where: { id: row.id, status: 'pending_payment' },
        data: { status: 'canceled', canceled_reason: 'checkout_failed' },
      });
      throw e;
    }
    const updated = await this.prisma.casePayment.update({
      where: { id: row.id },
      data: { stripe_checkout_id: session.id },
    });
    const [payment] = await this.present([updated], s);
    return { paymentId: row.id, checkoutUrl: session.url, quote, payment };
  }

  /** The client gives up an unpaid checkout. */
  async cancel(user: RequestUser, paymentId: string): Promise<CasePaymentDto> {
    const row = await this.prisma.casePayment.findUnique({
      where: { id: paymentId },
    });
    if (!row || row.client_id !== user.sub) throw notFound();
    if (row.status !== 'pending_payment') {
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_STATE,
        message: 'Only an unpaid checkout can be canceled.',
      });
    }
    const updated = await this.prisma.casePayment.update({
      where: { id: paymentId },
      data: { status: 'canceled', canceled_reason: 'client' },
    });
    const [dto] = await this.present([updated], await this.settings());
    return dto;
  }

  /** The attorney gives money back (within the refund window). */
  async refund(
    user: RequestUser,
    paymentId: string,
    dto: RefundCasePaymentDto,
  ): Promise<CasePaymentDto> {
    this.assertAttorney(user);
    this.assertNotAssistant(user);
    const row = await this.prisma.casePayment.findUnique({
      where: { id: paymentId },
    });
    if (!row || row.attorney_id !== user.sub) throw notFound();
    const s = await this.settings();
    if (
      row.paid_at &&
      s.refundWindowDays > 0 &&
      Date.now() - row.paid_at.getTime() > s.refundWindowDays * DAY_MS
    ) {
      throw new ConflictException({
        code: ErrorCode.REFUND_NOT_ALLOWED,
        message: `Refunds from the app are possible for ${s.refundWindowDays} days after a payment; contact support.`,
      });
    }
    const updated = await this.refundPayment(row, dto, {
      type: 'attorney',
      id: user.sub,
    });
    const [out] = await this.present([updated], s);
    return out;
  }

  /** Shared by the attorney's and the admin's refund. [amountCents] is
   * what goes back to the client's card. */
  async refundPayment(
    row: CasePayment,
    dto: RefundCasePaymentDto,
    by: { type: 'attorney' | 'admin'; id: string },
  ): Promise<CasePayment> {
    if (!isPaid(row.status)) {
      throw new ConflictException({
        code: ErrorCode.REFUND_NOT_ALLOWED,
        message: 'Only a successful payment can be refunded.',
      });
    }
    const left = row.client_total_cents - row.refunded_cents;
    const amount = dto.amountCents ?? left;
    if (amount <= 0 || amount > left) {
      throw new ConflictException({
        code: ErrorCode.REFUND_AMOUNT_EXCEEDED,
        message: `Up to ${(left / 100).toFixed(2)} USD can still be refunded.`,
        details: { leftCents: left },
      });
    }
    if (
      !this.provider?.refundConnected ||
      !row.stripe_account_id ||
      !row.stripe_payment_intent_id
    ) {
      throw notConfigured();
    }
    const refund = await this.prisma.casePaymentRefund.create({
      data: {
        payment_id: row.id,
        amount_cents: amount,
        reason: dto.reason,
        initiated_by_type: by.type,
        initiated_by: by.id,
        status: 'pending',
      },
    });
    let result: { id: string; status: string; failureReason: string | null };
    try {
      result = await this.provider.refundConnected({
        accountId: row.stripe_account_id,
        paymentIntentId: row.stripe_payment_intent_id,
        amountCents: amount,
        refundApplicationFee: true,
        idempotencyKey: `case-payment-refund:${refund.id}`,
        metadata: { paymentId: row.id, refundId: refund.id, by: by.type },
      });
    } catch (e) {
      await this.prisma.casePaymentRefund.update({
        where: { id: refund.id },
        data: { status: 'failed', failure_reason: String(e).slice(0, 500) },
      });
      throw new ConflictException({
        code: ErrorCode.REFUND_PROVIDER_FAILED,
        message: 'Stripe refused the refund. Try again later.',
      });
    }
    await this.prisma.casePaymentRefund.update({
      where: { id: refund.id },
      data: {
        status: result.status,
        stripe_refund_id: result.id,
        failure_reason: result.failureReason,
      },
    });
    if (result.status === 'failed') {
      throw new ConflictException({
        code: ErrorCode.REFUND_PROVIDER_FAILED,
        message: result.failureReason ?? 'The refund failed.',
      });
    }
    const refunded = row.refunded_cents + amount;
    const updated = await this.prisma.casePayment.update({
      where: { id: row.id },
      data: {
        refunded_cents: refunded,
        status:
          refunded >= row.client_total_cents
            ? 'refunded'
            : 'partially_refunded',
      },
    });
    await this.notify(row.client_id, 'case_payment_refunded', {
      caseId: row.case_id,
      paymentId: row.id,
      amountCents: amount,
    });
    return updated;
  }

  // ---- payment confirmation ----------------------------------------------------

  async applyCheckoutById(
    sessionId: string,
    accountId: string,
  ): Promise<boolean> {
    try {
      const session = this.provider?.retrieveConnectedCheckout
        ? await this.provider.retrieveConnectedCheckout(accountId, sessionId)
        : null;
      return session ? await this.applyCheckout(session) : false;
    } catch (e) {
      this.logger.warn(
        { sessionId, err: String(e) },
        'case payment checkout check failed',
      );
      return false;
    }
  }

  /** A paid checkout (webhook, the fake page, or the app's state read) →
   * succeeded + both sides notified. Idempotent. */
  async applyCheckout(session: ProviderConnectedCheckout): Promise<boolean> {
    if (session.metadata.kind !== CASE_PAYMENT_CHECKOUT_KIND) return false;
    if (session.status !== 'complete') return false;
    if (session.paymentStatus && session.paymentStatus !== 'paid') return false;
    const id = session.metadata.paymentId;
    if (!id) return false;
    const paid = await withTxRetry(this.prisma, async (tx) => {
      const p = await tx.casePayment.findUnique({ where: { id } });
      if (!p || p.stripe_checkout_id !== session.id) return null;
      // Pending, or a system cancel (expired / superseded) a late payment
      // may revive; never one the client canceled by hand.
      const revivable =
        p.status === 'pending_payment' ||
        (p.status === 'canceled' && p.canceled_reason !== 'client');
      if (!revivable) return null;
      await tx.casePayment.update({
        where: { id },
        data: {
          status: 'succeeded',
          paid_at: new Date(),
          stripe_payment_intent_id: session.paymentIntentId,
          stripe_charge_id: session.chargeId,
          receipt_url: session.receiptUrl,
          client_total_cents: session.amountTotalCents ?? p.client_total_cents,
          canceled_reason: null,
        },
      });
      return p;
    });
    if (!paid) return false;
    await this.notify(paid.attorney_id, 'case_payment_received', {
      caseId: paid.case_id,
      paymentId: paid.id,
      amountCents: paid.amount_cents,
    });
    await this.notify(paid.client_id, 'case_payment_sent', {
      caseId: paid.case_id,
      paymentId: paid.id,
      amountCents: paid.client_total_cents,
    });
    return true;
  }

  /** Stripe Connect events (routed here by SubscriptionSyncService). */
  async handleProviderEvent(event: ProviderEvent): Promise<void> {
    const o = event.object;
    const account = typeof o._account === 'string' ? o._account : null;
    switch (event.type) {
      case 'account.updated':
        await this.syncAccount(o.id);
        return;
      case 'checkout.session.completed': {
        const meta = o.metadata as Record<string, string> | undefined;
        const row = meta?.paymentId
          ? await this.prisma.casePayment.findUnique({
              where: { id: meta.paymentId },
            })
          : await this.prisma.casePayment.findUnique({
              where: { stripe_checkout_id: o.id },
            });
        const acct = account ?? row?.stripe_account_id ?? null;
        if (acct) await this.applyCheckoutById(o.id, acct);
        return;
      }
      case 'charge.refunded':
        // A refund made in the Stripe dashboard (or ours): mirror it.
        if (account) await this.syncCharge(account, o.id);
        return;
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
        await this.onDispute(event.type, o);
        return;
      default:
        this.logger.debug(`ignored connect event ${event.type}`);
    }
  }

  private async onDispute(
    type: string,
    o: ProviderEvent['object'],
  ): Promise<void> {
    const chargeId = typeof o.charge === 'string' ? o.charge : null;
    if (!chargeId) return;
    const row = await this.prisma.casePayment.findFirst({
      where: { stripe_charge_id: chargeId },
    });
    if (!row) return;
    const status = typeof o.status === 'string' ? o.status : 'needs_response';
    const lost = status === 'lost';
    const won = status === 'won';
    await this.prisma.casePayment.update({
      where: { id: row.id },
      data: {
        dispute_status: status,
        disputed_at: row.disputed_at ?? new Date(),
        status: lost
          ? 'refunded'
          : won
            ? row.refunded_cents > 0
              ? 'partially_refunded'
              : 'succeeded'
            : 'disputed',
        ...(lost ? { refunded_cents: row.client_total_cents } : {}),
      },
    });
    if (lost && row.refunded_cents < row.client_total_cents) {
      await this.prisma.casePaymentRefund.create({
        data: {
          payment_id: row.id,
          amount_cents: row.client_total_cents - row.refunded_cents,
          reason: 'Dispute lost (chargeback)',
          initiated_by_type: 'stripe',
          status: 'succeeded',
        },
      });
    }
    if (type === 'charge.dispute.created') {
      await this.notify(row.attorney_id, 'case_payment_disputed', {
        caseId: row.case_id,
        paymentId: row.id,
        amountCents: row.client_total_cents,
      });
    }
  }

  private async syncCharge(accountId: string, chargeId: string): Promise<void> {
    const row = await this.prisma.casePayment.findFirst({
      where: { stripe_charge_id: chargeId, stripe_account_id: accountId },
    });
    if (!row || !this.provider?.retrieveConnectedCharge) return;
    const ch = await this.provider.retrieveConnectedCharge(accountId, chargeId);
    if (!ch || ch.amountRefundedCents <= row.refunded_cents) return;
    const refunded = Math.min(ch.amountRefundedCents, row.client_total_cents);
    const delta = refunded - row.refunded_cents;
    await this.prisma.casePaymentRefund.create({
      data: {
        payment_id: row.id,
        amount_cents: delta,
        reason: 'Refunded in the Stripe dashboard',
        initiated_by_type: 'stripe',
        status: 'succeeded',
      },
    });
    await this.prisma.casePayment.update({
      where: { id: row.id },
      data: {
        refunded_cents: refunded,
        status:
          refunded >= row.client_total_cents
            ? 'refunded'
            : 'partially_refunded',
        receipt_url: row.receipt_url ?? ch.receiptUrl,
      },
    });
    await this.notify(row.client_id, 'case_payment_refunded', {
      caseId: row.case_id,
      paymentId: row.id,
      amountCents: delta,
    });
  }

  // ---- history -------------------------------------------------------------------

  /** Sent (client) or received (attorney) payments, newest first. */
  async myPayments(
    user: RequestUser,
    q: MyCasePaymentsQueryDto,
  ): Promise<{ items: CasePaymentDto[]; nextCursor: string | null }> {
    const rows = await this.prisma.casePayment.findMany({
      where: {
        AND: [
          this.mine(user),
          q.status ? { status: q.status } : {},
          q.caseId ? { case_id: q.caseId } : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(page, await this.settings()),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** This calendar year's totals for the Payments screen header. */
  async mySummary(user: RequestUser): Promise<MyCasePaymentsSummaryDto> {
    const since = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const rows = await this.prisma.casePayment.findMany({
      where: {
        ...this.mine(user),
        paid_at: { gte: since },
        status: { in: [...PAID_STATUSES, 'refunded'] },
      },
      select: {
        amount_cents: true,
        client_total_cents: true,
        refunded_cents: true,
      },
    });
    const attorney = user.role === 'attorney';
    return {
      totalCents: rows.reduce(
        (s, r) => s + (attorney ? r.amount_cents : r.client_total_cents),
        0,
      ),
      count: rows.length,
      refundedCents: rows.reduce((s, r) => s + r.refunded_cents, 0),
    };
  }

  async getPayment(user: RequestUser, id: string): Promise<CasePaymentDto> {
    const row = await this.prisma.casePayment.findUnique({ where: { id } });
    if (!row || (row.client_id !== user.sub && row.attorney_id !== user.sub))
      throw notFound();
    if (
      row.status === 'pending_payment' &&
      row.stripe_checkout_id &&
      row.stripe_account_id
    ) {
      await this.applyCheckoutById(
        row.stripe_checkout_id,
        row.stripe_account_id,
      );
    }
    const fresh = await this.prisma.casePayment.findUniqueOrThrow({
      where: { id },
    });
    const [dto] = await this.present([fresh], await this.settings());
    return dto;
  }

  // ---- housekeeping ------------------------------------------------------------

  /** Cron `case-payments.expire`: unpaid checkouts older than a day →
   * canceled. */
  async expire(now = new Date()): Promise<{ abandoned: number }> {
    const res = await this.prisma.casePayment.updateMany({
      where: {
        status: 'pending_payment',
        created_at: { lt: new Date(now.getTime() - PENDING_PAYMENT_TTL_MS) },
      },
      data: { status: 'canceled', canceled_reason: 'checkout_expired' },
    });
    return { abandoned: res.count };
  }

  // ---- presentation -------------------------------------------------------------

  async present(
    rows: CasePayment[],
    s: PaymentSettings,
  ): Promise<CasePaymentDto[]> {
    if (rows.length === 0) return [];
    const [parties, cases] = await Promise.all([
      this.parties(rows.flatMap((r) => [r.client_id, r.attorney_id])),
      this.prisma.case.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.case_id))] } },
        select: { id: true, title: true },
      }),
    ]);
    const titles = new Map(cases.map((c) => [c.id, c.title]));
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      caseId: r.case_id,
      caseTitle: titles.get(r.case_id) ?? null,
      kind: r.kind as PaymentKind,
      status: r.status as PaymentStatus,
      amountCents: r.amount_cents,
      platformFeeCents: r.platform_fee_cents,
      processingFeeCents: r.processing_fee_cents,
      clientTotalCents: r.client_total_cents,
      attorneyNetCents: r.attorney_net_cents,
      refundedCents: r.refunded_cents,
      currency: r.currency,
      note: r.note,
      receiptUrl: r.receipt_url,
      disputeStatus: r.dispute_status,
      paidAt: r.paid_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
      client: strip(parties.get(r.client_id)),
      attorney: strip(parties.get(r.attorney_id)),
      refundable:
        isPaid(r.status) &&
        r.refunded_cents < r.client_total_cents &&
        (s.refundWindowDays === 0 ||
          !r.paid_at ||
          now - r.paid_at.getTime() <= s.refundWindowDays * DAY_MS),
    }));
  }

  presentRefund(r: {
    id: string;
    payment_id: string;
    amount_cents: number;
    reason: string;
    initiated_by_type: string;
    status: string;
    failure_reason: string | null;
    created_at: Date;
  }): CasePaymentRefundDto {
    return {
      id: r.id,
      paymentId: r.payment_id,
      amountCents: r.amount_cents,
      reason: r.reason,
      initiatedByType: r.initiated_by_type,
      status: r.status,
      failureReason: r.failure_reason,
      createdAt: r.created_at.toISOString(),
    };
  }

  /** Name / username / avatar of users on a page — one query. */
  async parties(ids: string[]): Promise<Map<string, Party>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        avatar_file_id: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
    });
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    return new Map(
      users.map((u) => [
        u.id,
        {
          id: u.id,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
          username:
            u.attorney_profile?.username ?? u.client_profile?.username ?? null,
          avatarUrl: u.avatar_file_id
            ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
            : null,
          email: u.email,
        },
      ]),
    );
  }

  presentPayoutAccount(
    row: PayoutAccount | null,
    available: boolean,
  ): PayoutAccountDto {
    return {
      status: (row?.status as PayoutAccountStatus | undefined) ?? 'none',
      canReceive: !!row && row.status === 'active' && row.charges_enabled,
      chargesEnabled: row?.charges_enabled ?? false,
      payoutsEnabled: row?.payouts_enabled ?? false,
      detailsSubmitted: row?.details_submitted ?? false,
      requirementsDue: row?.requirements_due ?? [],
      disabledReason: row?.disabled_reason ?? null,
      available,
      updatedAt: row?.updated_at.toISOString() ?? null,
    };
  }

  // ---- helpers ---------------------------------------------------------------------

  private mine(user: RequestUser): Prisma.CasePaymentWhereInput {
    return user.role === 'attorney'
      ? { attorney_id: user.sub }
      : { client_id: user.sub };
  }

  private caseRows(caseId: string): Promise<CasePayment[]> {
    return this.prisma.casePayment.findMany({
      where: { case_id: caseId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }

  private appLinkBase(): string {
    return (
      this.config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'
    ).replace(/\/+$/, '');
  }

  private assertAttorney(user: RequestUser): void {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Attorneys only.',
      });
    }
  }

  /** Money is the attorney's own: an assistant never moves it. */
  private assertNotAssistant(user: RequestUser): void {
    if (user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney can do this, not an assistant.',
      });
    }
  }

  private assertAmount(amountCents: number, s: PaymentSettings): void {
    if (
      !Number.isInteger(amountCents) ||
      amountCents < s.minAmountCents ||
      amountCents > s.maxAmountCents
    ) {
      throw new BadRequestException({
        code: ErrorCode.PAYMENT_AMOUNT_INVALID,
        message: `The amount must be between ${(s.minAmountCents / 100).toFixed(2)} and ${(s.maxAmountCents / 100).toFixed(2)} USD.`,
        details: {
          field: 'amountCents',
          minAmountCents: s.minAmountCents,
          maxAmountCents: s.maxAmountCents,
        },
      });
    }
  }

  /** The attorney-fee amount of a new payment by kind. */
  private async amountFor(
    dto: CreateCasePaymentDto,
    s: PaymentSettings,
    caseId: string,
    bidAmountCents: number | null,
  ): Promise<number> {
    const invalid = (message: string) =>
      new BadRequestException({
        code: ErrorCode.PAYMENT_AMOUNT_INVALID,
        message,
        details: { field: 'amountCents' },
      });
    let amount: number;
    if (dto.kind === 'bid' || dto.kind === 'balance') {
      if (bidAmountCents === null)
        throw invalid('This case has no fixed bid amount; enter an amount.');
      amount = bidAmountCents;
      if (dto.kind === 'balance') {
        const paid = await this.prisma.casePayment.findMany({
          where: { case_id: caseId, status: { in: PAID_STATUSES } },
          select: {
            amount_cents: true,
            refunded_cents: true,
            client_total_cents: true,
          },
        });
        amount -= paid.reduce(
          (sum, r) => sum + r.amount_cents - refundedFee(r),
          0,
        );
        if (amount <= 0) throw invalid('The bid is already paid in full.');
      }
    } else {
      if (!s.allowCustomAmount && dto.kind === 'custom')
        throw invalid('Only the bid amount can be paid.');
      if (!s.allowPartial && dto.kind === 'deposit')
        throw invalid('Partial payments are off.');
      if (dto.amountCents === undefined) throw invalid('Enter an amount.');
      amount = dto.amountCents;
    }
    this.assertAmount(amount, s);
    return amount;
  }

  /** The case, which side the user is on, and the accepted attorney. */
  private async caseSide(user: RequestUser, caseId: string) {
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        client_id: true,
        status: true,
        title: true,
        deleted_at: true,
        accepted_bid: {
          select: {
            id: true,
            attorney_id: true,
            fee_type: true,
            amount_cents: true,
          },
        },
      },
    });
    if (!kase || kase.deleted_at) throw caseNotFound();
    const attorneyId = kase.accepted_bid?.attorney_id ?? null;
    const side: 'client' | 'attorney' | null =
      kase.client_id === user.sub
        ? 'client'
        : attorneyId === user.sub
          ? 'attorney'
          : null;
    if (!side) throw caseNotFound();
    return { kase, side, attorneyId };
  }

  private async notify(
    userId: string,
    type:
      | 'case_payment_received'
      | 'case_payment_sent'
      | 'case_payment_refunded'
      | 'case_payment_disputed'
      | 'payout_account_status',
    payload: Prisma.InputJsonObject,
  ): Promise<void> {
    try {
      await this.notifications?.emit({ type, recipientId: userId, payload });
    } catch (e) {
      this.logger.warn(`notification ${type} failed: ${String(e)}`);
    }
  }
}

function fixedBidAmount(
  bid: { fee_type: string; amount_cents: number } | null | undefined,
): number | null {
  return bid && bid.fee_type === 'fixed' && bid.amount_cents > 0
    ? bid.amount_cents
    : null;
}
