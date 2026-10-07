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
import { maxAssistantSeats, getAssistantLimit } from './seat-limit';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../plans/entitlements.service';
import {
  type Audience,
  sanitizeEntitlements,
} from '../plans/entitlement-catalog';
import { PlansService } from '../plans/plans.service';
import {
  ASSISTANT_SEAT_PRICE_CENTS,
  PAYMENT_PROVIDER,
  SUBSCRIPTION_CURRENCY,
  SUBSCRIPTION_PRICE_CENTS,
  TRIAL_DAYS,
  TRIAL_DAYS_MAX,
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

/** Owner 2026-10-05 (plan builder): a plan's own price row is keyed by
 * its code, its extra-seat price by `seat.<code>`. */
export const planPriceKind = (planCode: string): string => planCode;
export const seatPriceKind = (planCode: string): string => `seat.${planCode}`;
export const isLegacyKind = (kind: string): kind is PlanKind =>
  (PLAN_KINDS as readonly string[]).includes(kind);

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

/** Owner 2026-10-07: the strikethrough "old price" next to a price. */
export interface PriceDiscount {
  compareAtCents: number;
  /** Whole percent off, 1…99, always computed — never typed in. */
  percent: number;
}

/**
 * The discount a price row shows: only while the admin's switch is on AND
 * the old price is above today's. Raising the price to (or past) the old
 * one makes it disappear by itself — a discount never becomes a "plus".
 */
export function discountOf(
  row:
    | Pick<PlanPrice, 'amount_cents' | 'compare_at_cents' | 'show_discount'>
    | null
    | undefined,
): PriceDiscount | null {
  if (!row?.show_discount) return null;
  const was = row.compare_at_cents;
  if (was == null || was <= row.amount_cents || row.amount_cents <= 0) {
    return null;
  }
  // Rounded down: the badge never claims more than the real discount.
  const percent = Math.min(
    99,
    Math.floor(((was - row.amount_cents) / was) * 100),
  );
  return percent >= 1 ? { compareAtCents: was, percent } : null;
}

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
  private cache: { at: number; rows: Map<string, PlanPrice> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly entitlements?: EntitlementsService,
    @Optional() private readonly plans?: PlansService,
  ) {}

  /** The active row of every kind that has one (legacy kinds and plans). */
  async activeRows(): Promise<Map<string, PlanPrice>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.rows;
    }
    const list = await this.prisma.planPrice.findMany({
      where: { active: true },
      orderBy: { created_at: 'desc' },
    });
    const rows = new Map<string, PlanPrice>();
    for (const r of list) {
      if (!rows.has(r.kind)) rows.set(r.kind, r);
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

  /** Owner 2026-10-05: the admin's assistant seat limit; with
   * [attorneyId], that attorney's own limit when an admin set one. */
  maxSeats(attorneyId?: string): Promise<number> {
    return attorneyId
      ? getAssistantLimit(
          this.prisma,
          attorneyId,
          this.settings,
          this.entitlements,
        )
      : maxAssistantSeats(this.settings);
  }

  /** Owner 2026-10-05: the plan's own trial_days decides; the admin
   * setting `billing.trial_days` is only the fallback for an attorney
   * plan that leaves it unset (client plans: no trial unless set). */
  async trialDaysFor(
    plan: { audience: string; entitlements: unknown } | null,
  ): Promise<number> {
    if (!plan) return this.trialDays();
    const own = sanitizeEntitlements(
      plan.audience as Audience,
      plan.entitlements,
    ).trial_days;
    if (typeof own === 'number') return own;
    return plan.audience === 'attorney' ? this.trialDays() : 0;
  }

  /** Trial days of the attorney's default monthly plan — what legacy
   * flows (no plan picked yet) show and use. */
  async defaultTrialDays(): Promise<number> {
    const plan = this.plans
      ? await this.plans.defaultFor('attorney', 'month')
      : null;
    return this.trialDaysFor(plan);
  }

  /** Fallback trial days: the admin setting `billing.trial_days`
   * (0 = no trial), used when a plan does not set its own. */
  async trialDays(): Promise<number> {
    const raw = this.settings
      ? await this.settings.number('billing.trial_days')
      : TRIAL_DAYS;
    return Number.isFinite(raw)
      ? Math.min(TRIAL_DAYS_MAX, Math.max(0, Math.floor(raw)))
      : TRIAL_DAYS;
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

  /** Owner 2026-10-07: the discount shown next to [kind]'s price, if any. */
  async discount(kind: string): Promise<PriceDiscount | null> {
    return discountOf((await this.activeRows()).get(kind));
  }

  async amount(kind: PlanKind): Promise<number> {
    return (await this.amounts())[kind];
  }

  /** Owner 2026-10-05: the amount of ANY kind — a legacy kind (admin value
   * or built-in default) or a plan's row; null when a plan has no price
   * row yet. */
  async amountOf(kind: string): Promise<number | null> {
    if (isLegacyKind(kind)) return this.amount(kind);
    const row = (await this.activeRows()).get(kind);
    return row?.amount_cents ?? null;
  }

  currency(): string {
    return SUBSCRIPTION_CURRENCY;
  }

  /** The Stripe price for new purchases of [kind], or undefined (→ 503). */
  async priceId(kind: string): Promise<string | undefined> {
    await refreshProvider(this.provider);
    const row = (await this.activeRows()).get(kind);
    if (row) return this.ensureStripePrice(row);
    return isLegacyKind(kind) ? this.legacyPriceId(kind) : undefined;
  }

  /** [priceId] or a 503 PAYMENTS_NOT_CONFIGURED. */
  async requirePriceId(kind: string): Promise<string> {
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
  async knownPriceIds(kind: string): Promise<string[]> {
    await refreshProvider(this.provider);
    const mode = this.mode();
    const rows = await this.prisma.planPrice.findMany({ where: { kind } });
    const ids = rows
      .map((r) => jsonMap(r.stripe_price_ids)[mode])
      .filter((v): v is string => !!v);
    const legacy = isLegacyKind(kind) ? await this.legacyPriceId(kind) : null;
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
    const kind = row.kind;
    const legacyKind = isLegacyKind(kind);
    const mode = this.mode();
    const ids = jsonMap(row.stripe_price_ids);
    if (ids[mode]) return ids[mode];
    if (!this.provider.createPrice) {
      return legacyKind ? this.legacyPriceId(kind) : undefined;
    }
    const products = jsonMap(row.stripe_product_ids);
    const productId = products[mode] ?? (await this.productIdFor(kind, mode));
    const legacy =
      productId || !legacyKind ? undefined : await this.legacyPriceId(kind);
    const meta = await this.metaFor(kind);
    const created = await this.provider.createPrice({
      productId,
      productFromPriceId:
        legacy && !legacy.startsWith('price_fake') ? legacy : null,
      productName: meta.product,
      amountCents: row.amount_cents,
      currency: row.currency,
      interval: meta.interval,
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

  /** Stripe product name + billing interval of [kind]: built in for the
   * legacy kinds, from the plans table for a plan's (or its seat's) row. */
  async metaFor(
    kind: string,
  ): Promise<{ product: string; interval: 'month' | 'year' }> {
    if (isLegacyKind(kind)) return PLAN_META[kind];
    const seat = kind.startsWith('seat.');
    const code = seat ? kind.slice('seat.'.length) : kind;
    const plan = await this.prisma.plan.findUnique({
      where: { code },
      select: { name: true, interval: true },
    });
    const name =
      (plan && typeof plan.name === 'object' && plan.name !== null
        ? ((plan.name as Record<string, unknown>).en as string | undefined)
        : undefined) ?? code;
    if (seat) {
      return { product: `LawBid Assistant seat — ${name}`, interval: 'month' };
    }
    return {
      product: `LawBid — ${name}`,
      interval: plan?.interval === 'year' ? 'year' : 'month',
    };
  }

  /** The product an earlier price of [kind] used in [mode], if any. */
  private async productIdFor(
    kind: string,
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
