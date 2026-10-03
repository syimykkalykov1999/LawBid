import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlanPrice } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ASSISTANT_SEAT_PRICE_CENTS,
  PAYMENT_PROVIDER,
  SUBSCRIPTION_CURRENCY,
  SUBSCRIPTION_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
} from './billing.constants';
import { refreshProvider } from './dynamic-payment.provider';
import type { PaymentProvider, PriceMode } from './payment-provider';

export const PLAN_KINDS = [
  'monthly',
  'seat',
  'yearly',
  'client_badge',
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export type PlanAmounts = Record<PlanKind, number>;

/** What each plan is called on Stripe (product names) and billed by. */
export const PLAN_META: Record<
  PlanKind,
  { product: string; interval: 'month' | 'year' }
> = {
  monthly: { product: 'LawBid Attorney — Monthly', interval: 'month' },
  seat: { product: 'LawBid Assistant seat', interval: 'month' },
  yearly: { product: 'LawBid Prime — Yearly', interval: 'year' },
  client_badge: { product: 'LawBid Verified client badge', interval: 'month' },
};

/** The legacy price ids (admin key store / env) and the fake ones. */
const LEGACY: Record<
  PlanKind,
  { field: string | null; env: string; fake: string }
> = {
  monthly: { field: 'priceId', env: 'STRIPE_PRICE_ID', fake: 'price_fake_399' },
  seat: {
    field: 'priceSeatId',
    env: 'STRIPE_PRICE_SEAT_ID',
    fake: 'price_fake_seat_100',
  },
  yearly: {
    field: 'priceYearlyId',
    env: 'STRIPE_PRICE_YEARLY_ID',
    fake: 'price_fake_yearly_9590',
  },
  client_badge: {
    field: null,
    env: 'STRIPE_PRICE_VERIFIED_ID',
    fake: 'price_fake_badge',
  },
};

const CACHE_MS = 5_000;

/**
 * Owner 2026-10-03: plan prices are set in the admin (Billing → Prices).
 * The active plan_prices row of a kind is the amount the app shows and
 * the Stripe price new checkouts use; its Stripe price is created on the
 * first need for the current keys' mode (sandbox / live). With no row the
 * old behaviour stays: built-in amounts and the price ids from the key
 * store or env.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private cache: { at: number; rows: Map<PlanKind, PlanPrice> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  /** The active row of every kind that has one. */
  async activeRows(): Promise<Map<PlanKind, PlanPrice>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.rows;
    }
    const list = await this.prisma.planPrice.findMany({
      where: { active: true },
      orderBy: { created_at: 'desc' },
    });
    const rows = new Map<PlanKind, PlanPrice>();
    for (const r of list) {
      const kind = r.kind as PlanKind;
      if (!rows.has(kind)) rows.set(kind, r);
    }
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** Current amounts in cents (admin value, else the built-in default). */
  async amounts(): Promise<PlanAmounts> {
    const rows = await this.activeRows();
    const d = await this.defaults();
    return {
      monthly: rows.get('monthly')?.amount_cents ?? d.monthly,
      seat: rows.get('seat')?.amount_cents ?? d.seat,
      yearly: rows.get('yearly')?.amount_cents ?? d.yearly,
      client_badge: rows.get('client_badge')?.amount_cents ?? d.client_badge,
    };
  }

  /** The amounts used while the admin has set none. */
  async defaults(): Promise<PlanAmounts> {
    return {
      monthly: SUBSCRIPTION_PRICE_CENTS,
      seat: ASSISTANT_SEAT_PRICE_CENTS,
      yearly: YEARLY_PRICE_CENTS,
      client_badge: this.settings
        ? await this.settings.number('verification.client_badge_cents')
        : 1000,
    };
  }

  async amount(kind: PlanKind): Promise<number> {
    return (await this.amounts())[kind];
  }

  currency(): string {
    return SUBSCRIPTION_CURRENCY;
  }

  /** The Stripe price for new purchases of [kind], or undefined (→ 503). */
  async priceId(kind: PlanKind): Promise<string | undefined> {
    await refreshProvider(this.provider);
    const row = (await this.activeRows()).get(kind);
    if (row) return this.ensureStripePrice(row);
    return this.legacyPriceId(kind);
  }

  /** [priceId] or a 503 PAYMENTS_NOT_CONFIGURED. */
  async requirePriceId(kind: PlanKind): Promise<string> {
    const id = await this.priceId(kind);
    if (!id) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: `Stripe price for "${kind}" is not set.`,
        details: { price: kind },
      });
    }
    return id;
  }

  /** Every price id [kind] ever had in the current mode (old ones too). */
  async knownPriceIds(kind: PlanKind): Promise<string[]> {
    await refreshProvider(this.provider);
    const mode = this.mode();
    const rows = await this.prisma.planPrice.findMany({ where: { kind } });
    const ids = rows
      .map((r) => jsonMap(r.stripe_price_ids)[mode])
      .filter((v): v is string => !!v);
    const legacy = await this.legacyPriceId(kind);
    if (legacy) ids.push(legacy);
    return [...new Set(ids)];
  }

  mode(): PriceMode {
    return this.provider.name === 'fake'
      ? 'fake'
      : (this.provider.mode ?? 'test');
  }

  /** The row's Stripe price for the current mode, created when missing. */
  async ensureStripePrice(row: PlanPrice): Promise<string | undefined> {
    const kind = row.kind as PlanKind;
    const mode = this.mode();
    const ids = jsonMap(row.stripe_price_ids);
    if (ids[mode]) return ids[mode];
    if (!this.provider.createPrice) return this.legacyPriceId(kind);
    const products = jsonMap(row.stripe_product_ids);
    const productId = products[mode] ?? (await this.productIdFor(kind, mode));
    const legacy = productId ? undefined : await this.legacyPriceId(kind);
    const created = await this.provider.createPrice({
      productId,
      productFromPriceId:
        legacy && !legacy.startsWith('price_fake') ? legacy : null,
      productName: PLAN_META[kind].product,
      amountCents: row.amount_cents,
      currency: row.currency,
      interval: PLAN_META[kind].interval,
      idempotencyKey: `plan-price:${row.id}:${mode}`,
      metadata: { kind, planPriceId: row.id },
    });
    await this.prisma.planPrice.update({
      where: { id: row.id },
      data: {
        stripe_price_ids: { ...ids, [mode]: created.priceId },
        stripe_product_ids: { ...products, [mode]: created.productId },
      },
    });
    this.invalidate();
    this.logger.log(
      `stripe price ${created.priceId} created for ${kind} ${row.amount_cents} (${mode})`,
    );
    return created.priceId;
  }

  /** The product an earlier price of [kind] used in [mode], if any. */
  private async productIdFor(
    kind: PlanKind,
    mode: PriceMode,
  ): Promise<string | null> {
    const rows = await this.prisma.planPrice.findMany({
      where: { kind },
      orderBy: { created_at: 'desc' },
    });
    for (const r of rows) {
      const p = jsonMap(r.stripe_product_ids)[mode];
      if (p) return p;
    }
    return null;
  }

  private async legacyPriceId(kind: PlanKind): Promise<string | undefined> {
    const l = LEGACY[kind];
    const f: Record<string, string | undefined> =
      (await this.secrets?.get('stripe'))?.fields ?? {};
    return (
      (l.field ? f[l.field] : undefined) ??
      this.config.get<string>(l.env) ??
      (this.provider.name === 'fake' ? l.fake : undefined)
    );
  }
}

export function jsonMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val) out[k] = val;
  }
  return out;
}
