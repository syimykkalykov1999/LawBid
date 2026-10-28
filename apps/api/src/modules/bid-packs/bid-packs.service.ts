import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { LedgerPostingService } from '../ledger/ledger.public';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import {
  checkoutOf,
  oneTimePayPageSession,
  type OneTimePaySession,
} from '../billing/one-time-pay-page';
import { PayLinkService } from '../billing/pay-link.service';
import { AttorneyAdsService } from '../attorney-ads/attorney-ads.service';
import type {
  PaymentProvider,
  ProviderCheckoutSession,
} from '../billing/payment-provider';

export const BID_PACK_CHECKOUT_KIND = 'bid_pack';
export const BID_PACKS_FLAG = 'bid_packs';
export const BID_PACKS_SETTINGS_KEY = 'bid_packs.settings';

export interface BidPack {
  id: string;
  bids: number;
  priceCents: number;
}

const DEFAULT_PACKS: BidPack[] = [
  { id: 'pack_10', bids: 10, priceCents: 1500 },
  { id: 'pack_30', bids: 30, priceCents: 3900 },
  { id: 'pack_100', bids: 100, priceCents: 9900 },
];
const PACK_ID = /^[a-z][a-z0-9_]{1,39}$/;

/** Defensive parse: a broken row falls back to the defaults. */
export function parsePacks(raw: unknown): BidPack[] {
  const list = (raw as { packs?: unknown } | null)?.packs;
  if (!Array.isArray(list)) return DEFAULT_PACKS;
  const out: BidPack[] = [];
  for (const p of list as Record<string, unknown>[]) {
    if (
      typeof p?.id === 'string' &&
      PACK_ID.test(p.id) &&
      Number.isInteger(p.bids) &&
      (p.bids as number) > 0 &&
      Number.isInteger(p.priceCents) &&
      (p.priceCents as number) >= 100
    ) {
      out.push({
        id: p.id,
        bids: p.bids as number,
        priceCents: p.priceCents as number,
      });
    }
  }
  return out;
}

/**
 * Owner 2026-10-14: offers bought on top of the plan's monthly limit. The
 * sizes and prices are the owner's (admin), the whole feature sits behind
 * the `bid_packs` flag, payment is the same hosted one-time checkout the
 * promotions use. Credits never expire and are spent one per NEW offer,
 * only once the plan's monthly (or trial) limit is used up.
 */
@Injectable()
export class BidPacksService {
  private readonly logger = new Logger(BidPacksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    @Optional() private readonly settings?: AppSettingsService,
    // Owner 2026-10-22: our own card page in place of Stripe's.
    @Optional() private readonly payLink?: PayLinkService,
    // Owner 2026-10-28: per-state flag «bid packs allowed» (default on).
    @Optional() private readonly ads?: AttorneyAdsService,
    // Day-one foundations: the double-entry money ledger (same transaction).
    @Optional() private readonly ledger?: LedgerPostingService,
  ) {}

  async enabled(): Promise<boolean> {
    const f = await this.prisma.featureFlag.findUnique({
      where: { key: BID_PACKS_FLAG },
      select: { enabled: true },
    });
    return f?.enabled ?? false;
  }

  async packs(): Promise<BidPack[]> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: BID_PACKS_SETTINGS_KEY },
    });
    return parsePacks(row?.value);
  }

  async savePacks(packs: BidPack[]): Promise<BidPack[]> {
    const ids = new Set(packs.map((p) => p.id));
    if (ids.size !== packs.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Pack ids must be unique.',
      });
    }
    const value = { packs } as object;
    await this.prisma.appConfig.upsert({
      where: { key: BID_PACKS_SETTINGS_KEY },
      create: { key: BID_PACKS_SETTINGS_KEY, value },
      update: { value },
    });
    return packs;
  }

  async balance(userId: string): Promise<number> {
    const row = await this.prisma.bidCredit.findUnique({
      where: { user_id: userId },
    });
    return row?.balance ?? 0;
  }

  /** GET /bid-packs */
  async overview(userId: string): Promise<{
    enabled: boolean;
    balance: number;
    packs: BidPack[];
  }> {
    const enabled = await this.enabled();
    return {
      enabled,
      balance: await this.balance(userId),
      packs: enabled ? await this.packs() : [],
    };
  }

  /** Spend one credit (a new offer above the plan's limit). */
  async consume(userId: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE bid_credits SET balance = balance - 1, updated_at = now()
      WHERE user_id = ${userId}::uuid AND balance > 0`;
    return n > 0;
  }

  /** Give one back (the offer did not go through). */
  async refund(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE bid_credits SET balance = balance + 1, updated_at = now()
      WHERE user_id = ${userId}::uuid`;
  }

  /**
   * Algo audit 2026-10-27 (MONEY H-5): the payments of [paymentIds] were
   * refunded or charged back (webhook) — every paid pack bought with them
   * is marked `refunded` and its offers leave the balance (never below
   * zero: offers already spent are not clawed back). Idempotent: a pack
   * is marked once (conditional update). Returns the packs revoked.
   */
  async refundPayments(paymentIds: string[]): Promise<number> {
    if (paymentIds.length === 0) return 0;
    if (
      this.settings &&
      !(await this.settings.boolean('bid_packs.refund_revokes_enabled'))
    ) {
      return 0;
    }
    const rows = await this.prisma.bidPackPurchase.findMany({
      where: { payment_id: { in: paymentIds }, status: 'paid' },
      select: { id: true, user_id: true, bids: true },
    });
    let n = 0;
    for (const p of rows) {
      const done = await withTxRetry(this.prisma, async (tx) => {
        const mark = await tx.bidPackPurchase.updateMany({
          where: { id: p.id, status: 'paid' },
          data: { status: 'refunded' },
        });
        if (mark.count === 0) return false;
        await tx.$executeRaw`
          UPDATE bid_credits
          SET balance = GREATEST(balance - ${p.bids}::int, 0), updated_at = now()
          WHERE user_id = ${p.user_id}::uuid`;
        return true;
      });
      if (done) n += 1;
    }
    return n;
  }

  /** Owner 2026-10-16: packs are for verified attorneys (rollback:
   * `billing.require_verified_for_purchases` off). Owner 2026-10-22
   * (security audit #3, finding 8): only an attorney buys offer packs at
   * all — a client has no attorney profile, so the check below let them
   * through; and with verification required, no profile is not verified. */
  private async assertVerified(userId: string): Promise<void> {
    const buyer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (buyer?.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Offer packs are for attorneys.',
      });
    }
    if (!this.settings) return;
    if (
      !(await this.settings.boolean('billing.require_verified_for_purchases'))
    ) {
      return;
    }
    const p = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: userId },
      select: { verification_status: true },
    });
    if (!p || p.verification_status !== 'verified') {
      throw new ForbiddenException({
        code: ErrorCode.ATTORNEY_NOT_VERIFIED,
        message: 'Offer packs are available after verification.',
      });
    }
  }

  /** POST /bid-packs/:id/buy → the hosted payment page. */
  async buy(
    userId: string,
    packId: string,
    apiBase?: string,
  ): Promise<{ purchaseId: string; checkoutUrl: string }> {
    if (!(await this.enabled())) {
      throw new ConflictException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Offer packs are not available right now.',
      });
    }
    await this.assertVerified(userId);
    await this.ads?.assertBidPacksAllowed(userId);
    const pack = (await this.packs()).find((p) => p.id === packId);
    if (!pack) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No such pack.',
      });
    }
    if (!this.provider?.createOneTimeCheckout) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    const row = await this.prisma.bidPackPurchase.create({
      data: {
        user_id: userId,
        pack_id: pack.id,
        bids: pack.bids,
        price_cents: pack.priceCents,
      },
    });
    // Owner 2026-10-22: our own card page (card, Apple Pay, Google Pay);
    // Stripe's page stays the fallback.
    if (apiBase && this.payLink && (await this.payLink.enabled())) {
      const link = await this.payLink.link(
        userId,
        { kind: 'bid_pack', purchaseId: row.id },
        apiBase,
      );
      return { purchaseId: row.id, checkoutUrl: link.url };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const base = (
      this.config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'
    ).replace(/\/+$/, '');
    try {
      const session = await this.provider.createOneTimeCheckout({
        customerEmail: user?.email ?? null,
        amountCents: pack.priceCents,
        description: `LawBid — ${pack.bids} offers`,
        metadata: {
          kind: BID_PACK_CHECKOUT_KIND,
          purchaseId: row.id,
          userId,
        },
        successUrl: `${base}/bid-packs/success?purchase_id=${row.id}`,
        cancelUrl: `${base}/bid-packs/cancel?purchase_id=${row.id}`,
        idempotencyKey: `bid-pack:${row.id}`,
      });
      if (!session.url) {
        throw new ServiceUnavailableException({
          code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
          message: 'The checkout page is not available.',
        });
      }
      await this.prisma.bidPackPurchase.update({
        where: { id: row.id },
        data: { stripe_checkout_id: session.id },
      });
      return { purchaseId: row.id, checkoutUrl: session.url };
    } catch (e) {
      await this.prisma.bidPackPurchase.update({
        where: { id: row.id },
        data: { status: 'canceled' },
      });
      throw e;
    }
  }

  /** GET /bid-packs/purchases/:id — the app's return; also checks the
   * provider in case the webhook is late. */
  async purchase(
    userId: string,
    id: string,
  ): Promise<{ status: string; bids: number; balance: number }> {
    const row = await this.prisma.bidPackPurchase.findFirst({
      where: { id, user_id: userId },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No such purchase.',
      });
    }
    if (row.status === 'pending_payment' && row.stripe_checkout_id) {
      await this.applyCheckoutById(row.stripe_checkout_id);
    }
    const fresh = await this.prisma.bidPackPurchase.findUniqueOrThrow({
      where: { id },
    });
    return {
      status: fresh.status,
      bids: fresh.bids,
      balance: await this.balance(userId),
    };
  }

  /** Owner 2026-10-22: the card page opened for a pack — its PaymentIntent. */
  async payPageSession(
    userId: string,
    id: string,
  ): Promise<OneTimePaySession & { bids: number }> {
    const row = await this.prisma.bidPackPurchase.findUnique({ where: { id } });
    const s = await oneTimePayPageSession({
      provider: this.provider,
      row,
      userId,
      kind: BID_PACK_CHECKOUT_KIND,
      description: `LawBid — ${row?.bids ?? 0} offers`,
      save: async (pi) => {
        await this.prisma.bidPackPurchase.update({
          where: { id },
          data: { stripe_checkout_id: pi },
        });
      },
      apply: (session) => this.applyCheckout(session),
    });
    return { ...s, bids: row?.bids ?? 0 };
  }

  /** The card page says it paid: check its PaymentIntent and credit. */
  async payPageConfirm(userId: string, id: string): Promise<boolean> {
    const row = await this.prisma.bidPackPurchase.findUnique({
      where: { id },
    });
    if (!row || row.user_id !== userId) return false;
    if (row.status === 'paid') return true;
    return row.stripe_checkout_id
      ? this.applyCheckoutById(row.stripe_checkout_id)
      : false;
  }

  async applyCheckoutById(sessionId: string): Promise<boolean> {
    try {
      const s = await checkoutOf(this.provider, sessionId);
      return s ? await this.applyCheckout(s) : false;
    } catch (e) {
      this.logger.warn({ sessionId, err: String(e) }, 'pack check failed');
      return false;
    }
  }

  /** A paid pack checkout (webhook / fake page / the app's return) →
   * credits. Idempotent: only a pending purchase of this session moves. */
  async applyCheckout(session: ProviderCheckoutSession): Promise<boolean> {
    if (session.metadata.kind !== BID_PACK_CHECKOUT_KIND) return false;
    if (session.status !== 'complete') return false;
    if (session.paymentStatus && session.paymentStatus !== 'paid') return false;
    const id = session.metadata.purchaseId;
    if (!id) return false;
    return withTxRetry(this.prisma, async (tx) => {
      const p = await tx.bidPackPurchase.findUnique({ where: { id } });
      if (!p || p.stripe_checkout_id !== session.id) return false;
      if (p.status !== 'pending_payment') return false;
      const now = new Date();
      const payment = await tx.payment.create({
        data: {
          user_id: p.user_id,
          stripe_payment_intent_id: session.paymentIntentId ?? null,
          amount_cents: session.amountTotalCents ?? p.price_cents,
          currency: 'usd',
          status: 'succeeded',
          paid_at: now,
        },
      });
      await this.ledger?.paymentReceived(tx, payment, 'revenue_bid_packs');
      await tx.bidPackPurchase.update({
        where: { id },
        data: { status: 'paid', paid_at: now, payment_id: payment.id },
      });
      await tx.bidCredit.upsert({
        where: { user_id: p.user_id },
        create: { user_id: p.user_id, balance: p.bids },
        update: { balance: { increment: p.bids } },
      });
      return true;
    });
  }
}
