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
import { randomUUID } from 'node:crypto';
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
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { AttorneyTrustService } from '../attorney-trust/attorney-trust.service';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type {
  PaymentProvider,
  ProviderConnectAccount,
  ProviderConnectedCheckout,
  ProviderEvent,
} from '../billing/payment-provider';
import { ChatSystemMessages } from '../chat/chat-system.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CasePaymentDto,
  CasePaymentPartyDto,
  CasePaymentRefundDto,
  CasePaymentsStateDto,
  CreateCasePaymentDto,
  CreateCasePaymentResultDto,
  CreatePaymentRequestsDto,
  FeePayerAnswerDto,
  MyCasePaymentsQueryDto,
  MyCasePaymentsSummaryDto,
  PaymentQuoteDto,
  PaymentQuoteQueryDto,
  PaymentRequestDto,
  PaymentSettingsPublicDto,
  PaymentsExportQueryDto,
  PayoutAccountDto,
  PayoutPreferencesDto,
  RefundCasePaymentDto,
} from './case-payments.dto';
import { renderPaymentReceiptPdf } from './payment-receipt.pdf';
import {
  PAYMENT_SETTINGS_KEY,
  PAYMENTS_FLAG,
  PENDING_PAYMENT_TTL_MS,
  type PaymentKind,
  type PaymentRequestStatus,
  type PaymentSettings,
  type PaymentStatus,
  type PayoutAccountStatus,
  type FeePayerParty,
  type FeePayerStatus,
  PROCESSING_FEE_PAYERS,
  type ProcessingFeePayer,
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

function requestNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Payment request not found.',
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

/** The attorney's plan has no `platform_payments` term. */
function notEntitled(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.ENTITLEMENT_REQUIRED,
    message:
      'Your plan does not include payments through LawBid; see Settings → Subscription.',
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
    @Optional() private readonly chatSystem?: ChatSystemMessages,
    // Owner 2026-10-05 (plan builder): the plan term `platform_payments`.
    @Optional() private readonly entitlements?: EntitlementsService,
    // Owner 2026-10-05 (anti-fraud): the trust gate — holds, suspension
    // and the owner's requirements close payments to an attorney.
    @Optional() private readonly trust?: AttorneyTrustService,
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
      feePayer: s.feePayer,
      processingFeePayer: s.processingFeePayer,
      processingFeePercent: s.processingFeePercent,
      processingFeeFixedCents: s.processingFeeFixedCents,
      saveCards: s.saveCards,
      allowInvoices: s.allowInvoices,
      allowInstallments: s.allowInstallments,
      maxInstallments: s.maxInstallments,
      feePayerMaxRounds: s.feePayerMaxRounds,
      minAmountCents: s.minAmountCents,
      maxAmountCents: s.maxAmountCents,
      allowCustomAmount: s.allowCustomAmount,
      allowPartial: s.allowPartial,
      refundWindowDays: s.refundWindowDays,
      disclaimerEn: s.disclaimerEn,
      disclaimerRu: s.disclaimerRu,
    };
  }

  /**
   * Who covers Stripe's fee is the parties' business (owner 2026-10-05):
   * with `caseId` the quote applies the case attorney's own default; an
   * explicit `processingFeePayer` previews a choice (the attorney
   * composing an invoice). Without either, the admin default for new
   * attorneys.
   */
  async quote(
    user: RequestUser,
    q: PaymentQuoteQueryDto,
  ): Promise<PaymentQuoteDto> {
    const s = await this.settings();
    this.assertAmount(q.amountCents, s);
    let payer: ProcessingFeePayer | undefined = q.processingFeePayer;
    if (!payer && q.caseId) {
      const { attorneyId } = await this.caseSide(user, q.caseId);
      payer = await this.attorneyFeePayer(attorneyId, s);
    }
    return quotePayment(q.amountCents, {
      ...s,
      processingFeePayer: payer ?? s.processingFeePayer,
    });
  }

  /** The attorney's own default for who covers Stripe's fee, else the
   * admin default for attorneys who have not chosen. */
  async attorneyFeePayer(
    attorneyId: string | null,
    s: PaymentSettings,
  ): Promise<ProcessingFeePayer> {
    if (!attorneyId) return s.processingFeePayer;
    const row = await this.prisma.payoutAccount.findUnique({
      where: { user_id: attorneyId },
      select: { processing_fee_payer: true },
    });
    return feePayerOf(row?.processing_fee_payer) ?? s.processingFeePayer;
  }

  /** `PUT /payout-account/preferences` — the attorney (not an assistant)
   * chooses who covers Stripe's fee on their invoices by default; every
   * invoice can still override it. Works before Stripe onboarding too. */
  async updatePreferences(
    user: RequestUser,
    dto: PayoutPreferencesDto,
  ): Promise<PayoutAccountDto> {
    this.assertAttorney(user);
    this.assertNotAssistant(user);
    const existing = await this.prisma.payoutAccount.findUnique({
      where: { user_id: user.sub },
    });
    if (!existing) {
      throw new ConflictException({
        code: ErrorCode.PAYOUT_ACCOUNT_NOT_READY,
        message: 'Connect your payout account first.',
      });
    }
    const row = await this.prisma.payoutAccount.update({
      where: { user_id: user.sub },
      data: { processing_fee_payer: dto.processingFeePayer },
    });
    return this.presentPayoutAccount(
      row,
      await this.enabled(),
      await this.settings(),
    );
  }

  /**
   * Whether this attorney's plan includes receiving payments through the
   * platform: the plan builder's term `platform_payments` (default plans
   * have it on; the baseline of an attorney without a subscription does
   * not). Resolved by EntitlementsService, the single gate for plan terms.
   */
  attorneyEntitled(attorneyId: string): Promise<boolean> {
    if (!attorneyId) return Promise.resolve(false);
    if (!this.entitlements) return Promise.resolve(true);
    return this.entitlements.has(attorneyId, 'platform_payments');
  }

  /** The anti-fraud gate: `false` while the attorney is on hold,
   * suspended, or has not met the owner's enabled requirements. */
  async trustOpen(attorneyId: string): Promise<boolean> {
    if (!attorneyId) return false;
    if (!this.trust) return true;
    return (await this.trust.paymentsGate(attorneyId)).ok;
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
    // The trust state may have changed since Stripe last called (a
    // verifier cleared the attorney): refresh the payout delay here too.
    if (fresh && fresh.status === 'active') {
      await this.syncPayoutDelay(user.sub, fresh.stripe_account_id).catch(
        (e: Error) =>
          this.logger.warn(`payout delay sync failed: ${e.message}`),
      );
    }
    return this.presentPayoutAccount(
      fresh,
      await this.enabled(),
      await this.settings(),
    );
  }

  /** Creates the Express account on first call; returns the hosted
   * onboarding link (short-lived, open in a browser). */
  async startOnboarding(user: RequestUser): Promise<{ url: string }> {
    this.assertAttorney(user);
    this.assertNotAssistant(user);
    if (!(await this.enabled())) throw disabled();
    if (!(await this.attorneyEntitled(user.sub))) throw notEntitled();
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
        select: {
          email: true,
          country_code: true,
          country: { select: { stripe_supported: true } },
        },
      });
      // Owner 2026-10-05: the payout account opens in the attorney's own
      // country, where Stripe Connect works there.
      const country = u?.country_code ?? 'US';
      if (u?.country && !u.country.stripe_supported) {
        throw new ForbiddenException({
          code: ErrorCode.COUNTRY_NOT_AVAILABLE,
          message:
            'In-app payments are not available in your country yet. Clients can pay you directly.',
          details: { countryCode: country, reason: 'payments' },
        });
      }
      const accountId = await this.provider.createConnectAccount({
        userId: user.sub,
        email: u?.email ?? null,
        country,
      });
      row = await this.prisma.payoutAccount.upsert({
        where: { user_id: user.sub },
        create: {
          user_id: user.sub,
          stripe_account_id: accountId,
          status: 'onboarding',
          country,
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
    await this.syncTrust(row.user_id, accountId, remote);
    return updated;
  }

  /** Owner 2026-10-05 (anti-fraud): tell the trust service who stands
   * behind the Stripe account (legal name / company representative), then
   * ask Stripe for the payout delay the attorney's trust state calls for.
   * Never fails the account sync. */
  private async syncTrust(
    attorneyId: string,
    accountId: string,
    remote: ProviderConnectAccount,
  ): Promise<void> {
    if (!this.trust) return;
    try {
      await this.trust.onStripeAccount(attorneyId, {
        chargesEnabled: remote.chargesEnabled,
        detailsSubmitted: remote.detailsSubmitted,
        businessType: remote.businessType,
        legalFirstName: remote.legalFirstName,
        legalLastName: remote.legalLastName,
        companyName: remote.companyName,
        companyUrl: remote.companyUrl,
        people: remote.people,
      });
      await this.syncPayoutDelay(attorneyId, accountId);
    } catch (e) {
      this.logger.warn(
        `trust sync for ${accountId} failed: ${(e as Error).message}`,
      );
    }
  }

  /** Applies the trust service's payout delay to the connected account
   * when it differs from what Stripe was last told. */
  async syncPayoutDelay(attorneyId: string, accountId: string): Promise<void> {
    if (!this.trust || !this.provider?.updateConnectPayoutDelay) return;
    const desired = await this.trust.desiredPayoutDelayDays(attorneyId);
    const synced = await this.prisma.attorneyTrust.findUnique({
      where: { attorney_id: attorneyId },
      select: { payout_delay_days: true, payout_delay_synced_at: true },
    });
    const current = synced?.payout_delay_synced_at
      ? synced.payout_delay_days
      : undefined;
    // Nothing to do: Stripe already has it, or the default was never changed.
    if (current === desired || (current === undefined && desired === null)) {
      return;
    }
    await this.provider.updateConnectPayoutDelay(accountId, desired);
    await this.trust.markPayoutDelaySynced(attorneyId, desired);
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
    const [entitled, trusted] = await Promise.all([
      this.attorneyEntitled(attorneyId ?? ''),
      this.trustOpen(attorneyId ?? ''),
    ]);
    const payable = PAYABLE_CASE_STATUSES.has(kase.status);
    const canPay =
      enabled &&
      side === 'client' &&
      attorneyReady &&
      payable &&
      entitled &&
      trusted;
    const canRequest =
      enabled &&
      side === 'attorney' &&
      attorneyReady &&
      payable &&
      entitled &&
      trusted &&
      s.allowInvoices;
    const requests = await this.prisma.paymentRequest.findMany({
      where: { case_id: caseId },
      orderBy: [{ created_at: 'desc' }, { seq: 'desc' }],
      take: 50,
    });
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
      canRequest,
      allowInstallments: s.allowInstallments,
      maxInstallments: s.maxInstallments,
      openRequestsCents: requests
        .filter((r) => r.status === 'open')
        .reduce((sum, r) => sum + r.amount_cents, 0),
      processingFeePayer:
        feePayerOf(account?.processing_fee_payer) ?? s.processingFeePayer,
      requests: await this.presentRequests(requests, s),
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
    await this.trust?.assertCanAcceptPayments(attorneyId);
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
    const req = await this.openRequestFor(dto, caseId, user.sub);
    const amountCents = await this.amountFor(
      dto,
      s,
      caseId,
      fixedBidAmount(bid),
      req,
    );
    // The invoice carries the attorney's choice of who covers Stripe's
    // fee; a free payment uses the attorney's default.
    const payer =
      feePayerOf(req?.processing_fee_payer) ??
      (await this.attorneyFeePayer(attorneyId, s));
    const quote = quotePayment(amountCents, {
      ...s,
      processingFeePayer: payer,
    });

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
          request_id: req?.id ?? null,
          status: 'pending_payment',
          amount_cents: quote.amountCents,
          platform_fee_cents: quote.platformFeeCents,
          processing_fee_cents: quote.processingFeeCents,
          client_total_cents: quote.clientTotalCents,
          attorney_net_cents: quote.attorneyNetCents,
          fee_type: quote.feeType,
          fee_payer: quote.feePayer,
          processing_fee_payer: quote.processingFeePayer,
          note: req ? req.description : dto.note?.trim() || null,
          stripe_account_id: account.stripe_account_id,
        },
      });
    });

    let session: { id: string; url: string };
    try {
      const client = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { email: true, first_name: true, last_name: true },
      });
      const customerId = s.saveCards
        ? await this.connectedCustomer(
            user.sub,
            account.stripe_account_id,
            client?.email ?? null,
            [client?.first_name, client?.last_name].filter(Boolean).join(' ') ||
              null,
          )
        : null;
      const base = this.appLinkBase();
      session = await this.provider.createConnectedCheckout({
        accountId: account.stripe_account_id,
        customerEmail: client?.email ?? null,
        customerId,
        saveCard: s.saveCards && !!customerId,
        amountCents: quote.clientTotalCents,
        // Only the platform's own fee; the processing estimate stays on
        // the attorney's balance, where Stripe takes its real fee.
        applicationFeeCents: quote.platformFeeCents,
        description: req
          ? `LawBid — ${req.description.slice(0, 80)}`
          : `LawBid — ${kase.title.slice(0, 80)}`,
        metadata: {
          kind: CASE_PAYMENT_CHECKOUT_KIND,
          paymentId: row.id,
          caseId,
          userId: user.sub,
          attorneyId,
          ...(req ? { requestId: req.id } : {}),
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
    if (row.status === 'refunded') {
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_STATE,
        message: 'This payment is already refunded in full.',
      });
    }
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
      if (p.request_id) {
        await tx.paymentRequest.updateMany({
          where: { id: p.request_id, status: { in: ['open', 'expired'] } },
          data: {
            status: 'paid',
            payment_id: p.id,
            paid_at: new Date(),
            // Paying the attorney's proposal accepts it.
            fee_payer_status: 'agreed',
            fee_payer_agreed_at: new Date(),
          },
        });
      }
      return p;
    });
    if (!paid) return false;
    await this.chatLine(paid.case_id, 'payment_received', paid.amount_cents);
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

  // ---- payment requests (invoices) ---------------------------------------------

  /** `POST /cases/:id/payment-requests` — the attorney (or an assistant)
   * asks the client to pay: one request, or several = installments. */
  async createRequests(
    user: RequestUser,
    caseId: string,
    dto: CreatePaymentRequestsDto,
  ): Promise<PaymentRequestDto[]> {
    if (!(await this.enabled())) throw disabled();
    const { kase, side, attorneyId } = await this.caseSide(user, caseId);
    if (side !== 'attorney' || !attorneyId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney of this case can request a payment.',
      });
    }
    if (!PAYABLE_CASE_STATUSES.has(kase.status)) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message:
          'Payment requests are possible once you are at work on the case.',
      });
    }
    if (!(await this.attorneyEntitled(attorneyId))) throw notEntitled();
    await this.trust?.assertCanAcceptPayments(attorneyId);
    const s = await this.settings();
    if (!s.allowInvoices) throw disabled();
    const invalid = (message: string, field = 'items') =>
      new BadRequestException({
        code: ErrorCode.PAYMENT_AMOUNT_INVALID,
        message,
        details: { field },
      });
    if (dto.items.length > 1 && !s.allowInstallments)
      throw invalid('Installments are off; send one request.');
    if (dto.items.length > s.maxInstallments)
      throw invalid(`At most ${s.maxInstallments} installments.`);
    for (const it of dto.items) this.assertAmount(it.amountCents, s);
    const account = await this.prisma.payoutAccount.findUnique({
      where: { user_id: attorneyId },
    });
    if (!account || account.status !== 'active' || !account.charges_enabled) {
      throw new ConflictException({
        code: ErrorCode.PAYOUT_ACCOUNT_NOT_READY,
        message:
          'Connect your payout account first (Settings → Receiving payments).',
      });
    }
    const planId = dto.items.length > 1 ? randomUUID() : null;
    const total = dto.items.reduce((sum, it) => sum + it.amountCents, 0);
    const payer =
      dto.processingFeePayer ??
      feePayerOf(account.processing_fee_payer) ??
      s.processingFeePayer;
    const rows = await withTxRetry(this.prisma, async (tx) => {
      const created: PaymentRequest[] = [];
      for (const [i, it] of dto.items.entries()) {
        created.push(
          await tx.paymentRequest.create({
            data: {
              case_id: caseId,
              attorney_id: attorneyId,
              client_id: kase.client_id,
              created_by: user.assistant?.userId ?? user.sub,
              amount_cents: it.amountCents,
              description: (it.description?.trim() || dto.description).slice(
                0,
                200,
              ),
              due_at: it.dueAt ? new Date(it.dueAt) : null,
              processing_fee_payer: payer,
              plan_id: planId,
              seq: i + 1,
              total: dto.items.length,
            },
          }),
        );
      }
      // The chat line is written in the same transaction (one per plan).
      const changes = await this.chatSystem?.post(
        tx,
        { case_id: caseId },
        'payment_requested',
        { param: String(total) },
      );
      return { created, changes: changes ?? [] };
    });
    this.chatSystem?.publish(rows.changes);
    await this.notify(kase.client_id, 'payment_request_created', {
      caseId,
      requestId: rows.created[0]?.id ?? null,
      planId,
      amountCents: total,
      installments: dto.items.length,
    });
    return this.presentRequests(rows.created, s);
  }

  async listRequests(
    user: RequestUser,
    caseId: string,
  ): Promise<PaymentRequestDto[]> {
    await this.caseSide(user, caseId);
    const rows = await this.prisma.paymentRequest.findMany({
      where: { case_id: caseId },
      orderBy: [{ created_at: 'desc' }, { seq: 'desc' }],
      take: 100,
    });
    return this.presentRequests(rows);
  }

  /** The attorney withdraws an open request. */
  async cancelRequest(
    user: RequestUser,
    id: string,
  ): Promise<PaymentRequestDto> {
    const row = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!row || row.attorney_id !== user.sub) throw requestNotFound();
    if (row.status !== 'open' && row.status !== 'expired') {
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_STATE,
        message: `This request is ${row.status}.`,
      });
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const u = await tx.paymentRequest.update({
        where: { id },
        data: { status: 'canceled', canceled_at: new Date() },
      });
      const changes = await this.chatSystem?.post(
        tx,
        { case_id: row.case_id },
        'payment_request_canceled',
        { param: String(row.amount_cents) },
      );
      return { u, changes: changes ?? [] };
    });
    this.chatSystem?.publish(updated.changes);
    await this.notify(row.client_id, 'payment_request_canceled', {
      caseId: row.case_id,
      requestId: row.id,
      amountCents: row.amount_cents,
    });
    const [dto] = await this.presentRequests([updated.u]);
    return dto;
  }

  /** The open request a `kind = invoice` payment pays, checked against
   * the case and the client. An expired request may still be paid. */
  private async openRequestFor(
    dto: CreateCasePaymentDto,
    caseId: string,
    clientId: string,
  ): Promise<PaymentRequest | null> {
    if (dto.kind !== 'invoice') return null;
    if (!dto.requestId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'requestId is required for kind = invoice.',
        details: { field: 'requestId' },
      });
    }
    const row = await this.prisma.paymentRequest.findUnique({
      where: { id: dto.requestId },
    });
    if (!row || row.case_id !== caseId || row.client_id !== clientId)
      throw requestNotFound();
    if (row.status !== 'open' && row.status !== 'expired') {
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_STATE,
        message: `This request is already ${row.status}.`,
      });
    }
    if (!requestPayable(row)) {
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_STATE,
        message:
          'Who covers the Stripe fee is not agreed yet: the attorney has to answer your counter-offer.',
      });
    }
    return row;
  }

  /**
   * `POST /payment-requests/:id/fee-payer` — who covers Stripe's fee is
   * agreed like a bid (owner 2026-10-05 03:03): the attorney proposed with
   * the invoice; the client accepts or counters; the attorney accepts or
   * counters back. Only the side that did not make the current proposal
   * may answer; counter-offers are capped by the admin like bid rounds.
   * Paying the attorney's proposal also accepts it (see `applyCheckout`).
   */
  async answerFeePayer(
    user: RequestUser,
    id: string,
    dto: FeePayerAnswerDto,
  ): Promise<PaymentRequestDto> {
    const row = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!row) throw requestNotFound();
    const me: FeePayerParty | null =
      row.attorney_id === user.sub
        ? 'attorney'
        : row.client_id === user.sub
          ? 'client'
          : null;
    if (!me) throw requestNotFound();
    if (me === 'attorney') this.assertNotAssistant(user);
    const s = await this.settings();
    const conflict = (code: ErrorCode, message: string) =>
      new ConflictException({ code, message });
    if (row.status !== 'open' && row.status !== 'expired')
      throw conflict(
        ErrorCode.PAYMENT_INVALID_STATE,
        `This request is ${row.status}.`,
      );
    if (row.fee_payer_status === 'agreed')
      throw conflict(
        ErrorCode.PAYMENT_INVALID_STATE,
        'Who covers the Stripe fee is already agreed.',
      );
    if (row.fee_payer_by === me)
      throw conflict(
        ErrorCode.PAYMENT_INVALID_STATE,
        "It is the other side's turn to answer your proposal.",
      );
    const other = me === 'attorney' ? row.client_id : row.attorney_id;
    let data: Prisma.PaymentRequestUpdateInput;
    let key: 'payment_fee_agreed' | 'payment_fee_countered';
    let payer = row.processing_fee_payer;
    if (dto.action === 'accept') {
      data = { fee_payer_status: 'agreed', fee_payer_agreed_at: new Date() };
      key = 'payment_fee_agreed';
    } else {
      if (!dto.processingFeePayer) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'processingFeePayer is required for a counter-offer.',
          details: { field: 'processingFeePayer' },
        });
      }
      if (dto.processingFeePayer === row.processing_fee_payer)
        throw conflict(
          ErrorCode.PAYMENT_INVALID_STATE,
          'That is the current proposal; accept it instead.',
        );
      if (row.fee_payer_rounds >= s.feePayerMaxRounds)
        throw conflict(
          ErrorCode.PAYMENT_FEE_MAX_ROUNDS_REACHED,
          `No more counter-offers (limit ${s.feePayerMaxRounds}); accept or let the attorney withdraw the invoice.`,
        );
      payer = dto.processingFeePayer;
      data = {
        processing_fee_payer: payer,
        fee_payer_status: 'countered',
        fee_payer_by: me,
        fee_payer_rounds: { increment: 1 },
      };
      key = 'payment_fee_countered';
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const u = await tx.paymentRequest.update({ where: { id }, data });
      const changes = await this.chatSystem?.post(
        tx,
        { case_id: row.case_id },
        key,
        { param: payer },
      );
      return { u, changes: changes ?? [] };
    });
    this.chatSystem?.publish(updated.changes);
    await this.notify(other, key, {
      caseId: row.case_id,
      requestId: row.id,
      amountCents: row.amount_cents,
      processingFeePayer: payer,
      by: me,
    });
    const [out] = await this.presentRequests([updated.u], s);
    return out;
  }

  async presentRequests(
    rows: PaymentRequest[],
    settings?: PaymentSettings,
  ): Promise<PaymentRequestDto[]> {
    if (rows.length === 0) return [];
    const s = settings ?? (await this.settings());
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
      amountCents: r.amount_cents,
      description: r.description,
      dueAt: r.due_at?.toISOString() ?? null,
      ...breakdown(r, s),
      feePayerStatus: r.fee_payer_status as FeePayerStatus,
      feePayerBy: r.fee_payer_by as FeePayerParty,
      feePayerRounds: r.fee_payer_rounds,
      feePayerMaxRounds: s.feePayerMaxRounds,
      canPay: requestPayable(r),
      status: r.status as PaymentRequestStatus,
      overdue: r.status === 'open' && !!r.due_at && r.due_at.getTime() < now,
      planId: r.plan_id,
      seq: r.seq,
      total: r.total,
      paymentId: r.payment_id,
      paidAt: r.paid_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
      client: strip(parties.get(r.client_id)),
      attorney: strip(parties.get(r.attorney_id)),
    }));
  }

  /**
   * Cron `case-payments.remind` (daily): the client is reminded N days
   * before a request is due (admin setting), then every K days while it
   * is overdue; a request left unpaid long after its due date is closed
   * as expired (the client may still pay it from the case).
   */
  async remind(
    now = new Date(),
  ): Promise<{ reminded: number; overdue: number; expired: number }> {
    const s = await this.settings();
    const result = { reminded: 0, overdue: 0, expired: 0 };
    if (!(await this.enabled())) return result;
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const open = await this.prisma.paymentRequest.findMany({
      where: { status: 'open', due_at: { not: null } },
      take: 2000,
    });
    for (const r of open) {
      if (!r.due_at) continue;
      const dueDay = Date.UTC(
        r.due_at.getUTCFullYear(),
        r.due_at.getUTCMonth(),
        r.due_at.getUTCDate(),
      );
      const daysLeft = Math.round((dueDay - today) / DAY_MS);
      const remindedToday =
        !!r.last_reminded_at && r.last_reminded_at.getTime() >= today;
      if (
        daysLeft < 0 &&
        s.invoiceExpireDays > 0 &&
        -daysLeft > s.invoiceExpireDays
      ) {
        await this.prisma.paymentRequest.update({
          where: { id: r.id },
          data: { status: 'expired' },
        });
        result.expired += 1;
        continue;
      }
      let type: 'payment_request_due' | 'payment_request_overdue' | null = null;
      if (daysLeft >= 0 && s.invoiceReminderDays.includes(daysLeft)) {
        type = 'payment_request_due';
      } else if (daysLeft < 0 && s.overdueReminderEveryDays > 0) {
        const since = r.last_reminded_at ?? r.due_at;
        if (
          now.getTime() - since.getTime() >=
          s.overdueReminderEveryDays * DAY_MS
        )
          type = 'payment_request_overdue';
      }
      if (!type || remindedToday) continue;
      await this.notify(r.client_id, type, {
        caseId: r.case_id,
        requestId: r.id,
        amountCents: r.amount_cents,
        dueAt: r.due_at.toISOString(),
        daysLeft,
      });
      await this.prisma.paymentRequest.update({
        where: { id: r.id },
        data: { last_reminded_at: now, reminders_sent: { increment: 1 } },
      });
      if (type === 'payment_request_due') result.reminded += 1;
      else result.overdue += 1;
    }
    return result;
  }

  /** «Счёт выставлен / оплачен» in the case chat; never fails a payment. */
  private async chatLine(
    caseId: string,
    key: 'payment_received',
    cents: number,
  ): Promise<void> {
    if (!this.chatSystem) return;
    try {
      const changes = await withTxRetry(this.prisma, (tx) =>
        this.chatSystem!.post(tx, { case_id: caseId }, key, {
          param: String(cents),
        }),
      );
      this.chatSystem.publish(changes);
    } catch (e) {
      this.logger.warn(`chat line ${key} failed: ${String(e)}`);
    }
  }

  /** The client as a Stripe customer on this attorney's account (saved
   * cards). Created once per (client, account); never blocks a payment. */
  private async connectedCustomer(
    clientId: string,
    accountId: string,
    email: string | null,
    name: string | null,
  ): Promise<string | null> {
    if (!this.provider?.ensureConnectedCustomer) return null;
    const existing = await this.prisma.connectedCustomer.findUnique({
      where: {
        client_id_stripe_account_id: {
          client_id: clientId,
          stripe_account_id: accountId,
        },
      },
    });
    if (existing) return existing.stripe_customer_id;
    try {
      const id = await this.provider.ensureConnectedCustomer({
        accountId,
        email,
        name,
        metadata: { userId: clientId },
      });
      await this.prisma.connectedCustomer.upsert({
        where: {
          client_id_stripe_account_id: {
            client_id: clientId,
            stripe_account_id: accountId,
          },
        },
        create: {
          client_id: clientId,
          stripe_account_id: accountId,
          stripe_customer_id: id,
        },
        update: {},
      });
      return id;
    } catch (e) {
      this.logger.warn(`connected customer failed: ${String(e)}`);
      return null;
    }
  }

  // ---- documents -------------------------------------------------------------------

  /** `GET /payments/:id/receipt.pdf` — a receipt for either side. */
  async receiptPdf(
    user: RequestUser,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.prisma.casePayment.findUnique({ where: { id } });
    if (!row || (row.client_id !== user.sub && row.attorney_id !== user.sub))
      throw notFound();
    if (!isPaid(row.status) && row.status !== 'refunded') {
      throw new ConflictException({
        code: ErrorCode.PAYMENT_INVALID_STATE,
        message: 'A receipt exists once the payment went through.',
      });
    }
    const s = await this.settings();
    const [dto] = await this.present([row], s);
    const [refunds, request, parties] = await Promise.all([
      this.prisma.casePaymentRefund.findMany({
        where: { payment_id: id, status: 'succeeded' },
        orderBy: { created_at: 'asc' },
      }),
      row.request_id
        ? this.prisma.paymentRequest.findUnique({
            where: { id: row.request_id },
          })
        : null,
      this.parties([row.client_id, row.attorney_id]),
    ]);
    const buffer = await renderPaymentReceiptPdf({
      payment: dto,
      quote: quotePayment(row.amount_cents, {
        ...s,
        processingFeePayer: row.processing_fee_payer as ProcessingFeePayer,
        feeType: row.fee_type as PaymentSettings['feeType'],
        feePayer: row.fee_payer as PaymentSettings['feePayer'],
        feeFixedCents: row.platform_fee_cents,
      }),
      clientEmail: parties.get(row.client_id)?.email ?? null,
      attorneyEmail: parties.get(row.attorney_id)?.email ?? null,
      request: request
        ? {
            description: request.description,
            seq: request.seq,
            total: request.total,
          }
        : null,
      refunds: refunds.map((r) => ({
        amountCents: r.amount_cents,
        reason: r.reason,
        createdAt: r.created_at,
      })),
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeChargeId: row.stripe_charge_id,
      disclaimerEn: s.disclaimerEn,
      disclaimerRu: s.disclaimerRu,
      forAttorney: user.sub === row.attorney_id,
    });
    return {
      buffer,
      filename: `lawbid-receipt-${row.id.slice(0, 8)}.pdf`,
    };
  }

  /** `GET /payments/export.csv` — the user's own payments for their
   * bookkeeping (attorney: received; client: paid). */
  async exportCsv(
    user: RequestUser,
    q: PaymentsExportQueryDto,
  ): Promise<string> {
    const rows = await this.prisma.casePayment.findMany({
      where: {
        AND: [
          this.mine(user),
          { status: { in: [...PAID_STATUSES, 'refunded'] } },
          q.from ? { paid_at: { gte: new Date(q.from) } } : {},
          q.to ? { paid_at: { lte: new Date(q.to) } } : {},
        ],
      },
      orderBy: [{ paid_at: 'asc' }],
      take: 5000,
    });
    const s = await this.settings();
    const items = await this.present(rows, s);
    const attorney = user.role === 'attorney';
    const head = [
      'date',
      'case',
      'description',
      attorney ? 'client' : 'attorney',
      'kind',
      'status',
      'amount_usd',
      'platform_fee_usd',
      'processing_fee_usd',
      'client_total_usd',
      'attorney_net_usd',
      'refunded_usd',
      'stripe_payment_intent',
      'payment_id',
    ];
    const usd = (c: number) => (c / 100).toFixed(2);
    const esc = (v: string | null | undefined) =>
      `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = items.map((p, i) => {
      const r = rows[i];
      return [
        p.paidAt ?? p.createdAt,
        esc(p.caseTitle),
        esc(p.note),
        esc(
          attorney
            ? (p.client?.name ?? p.client?.username)
            : (p.attorney?.name ?? p.attorney?.username),
        ),
        p.kind,
        p.status,
        usd(p.amountCents),
        usd(p.platformFeeCents),
        usd(p.processingFeeCents),
        usd(p.clientTotalCents),
        usd(p.attorneyNetCents),
        usd(p.refundedCents),
        esc(r.stripe_payment_intent_id),
        p.id,
      ].join(',');
    });
    return [head.join(','), ...lines].join('\r\n') + '\r\n';
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
      requestId: r.request_id,
      status: r.status as PaymentStatus,
      amountCents: r.amount_cents,
      platformFeeCents: r.platform_fee_cents,
      processingFeeCents: r.processing_fee_cents,
      clientTotalCents: r.client_total_cents,
      attorneyNetCents: r.attorney_net_cents,
      processingFeePayer: r.processing_fee_payer as ProcessingFeePayer,
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
    s: PaymentSettings,
  ): PayoutAccountDto {
    const own = feePayerOf(row?.processing_fee_payer);
    return {
      processingFeePayer: own ?? s.processingFeePayer,
      processingFeePayerIsDefault: own === null,
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
    req: PaymentRequest | null,
  ): Promise<number> {
    const invalid = (message: string) =>
      new BadRequestException({
        code: ErrorCode.PAYMENT_AMOUNT_INVALID,
        message,
        details: { field: 'amountCents' },
      });
    let amount: number;
    if (dto.kind === 'invoice') {
      if (!req) throw invalid('Pick the payment request to pay.');
      amount = req.amount_cents;
    } else if (dto.kind === 'bid' || dto.kind === 'balance') {
      if (bidAmountCents === null)
        throw invalid('This case has no fixed bid amount; enter an amount.');
      amount = bidAmountCents;
      // What already reached the attorney for this case (net of refunds):
      // the balance is the rest of the bid, and a bid paid in full is not
      // charged twice by accident (a second tap is a `custom` payment).
      const paid = await this.prisma.casePayment.findMany({
        where: { case_id: caseId, status: { in: PAID_STATUSES } },
        select: {
          amount_cents: true,
          refunded_cents: true,
          client_total_cents: true,
        },
      });
      const paidCents = paid.reduce(
        (sum, r) => sum + r.amount_cents - refundedFee(r),
        0,
      );
      if (dto.kind === 'balance') amount -= paidCents;
      else if (paidCents >= amount)
        throw invalid('The bid is already paid in full.');
      if (amount <= 0) throw invalid('The bid is already paid in full.');
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
      | 'payout_account_status'
      | 'payment_request_created'
      | 'payment_request_due'
      | 'payment_request_overdue'
      | 'payment_request_canceled'
      | 'payment_fee_countered'
      | 'payment_fee_agreed',
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

/** The client may pay an open invoice once the fee payer is agreed, or
 * while the attorney's own proposal stands (paying accepts it). */
function requestPayable(r: PaymentRequest): boolean {
  return (
    (r.status === 'open' || r.status === 'expired') &&
    (r.fee_payer_status === 'agreed' || r.fee_payer_by === 'attorney')
  );
}

/** A stored fee-payer value, or null when unset / unknown. */
export function feePayerOf(
  v: string | null | undefined,
): ProcessingFeePayer | null {
  return v && (PROCESSING_FEE_PAYERS as readonly string[]).includes(v)
    ? (v as ProcessingFeePayer)
    : null;
}

/** What the client will be charged for an invoice and what the attorney
 * receives, under the invoice's own fee-payer choice (estimates at
 * today's rate; the payment row snapshots the real quote). */
function breakdown(
  r: PaymentRequest,
  s: PaymentSettings,
): Pick<
  PaymentRequestDto,
  | 'processingFeePayer'
  | 'processingFeeCents'
  | 'clientTotalCents'
  | 'attorneyReceivesCents'
> {
  const payer = feePayerOf(r.processing_fee_payer) ?? s.processingFeePayer;
  const q = quotePayment(r.amount_cents, { ...s, processingFeePayer: payer });
  return {
    processingFeePayer: payer,
    processingFeeCents: q.processingFeeCents,
    clientTotalCents: q.clientTotalCents,
    attorneyReceivesCents: q.attorneyReceivesCents,
  };
}
