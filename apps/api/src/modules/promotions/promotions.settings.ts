/**
 * Owner 2026-10-02: paid case promotion (~$10/day). One app_config row
 * (`promotions.settings`, JSON) edited from GET/PUT
 * /admin/promotions/settings; missing fields fall back to the defaults.
 */
export const PROMOTION_SETTINGS_KEY = 'promotions.settings';

export interface PromotionSettings {
  /** Case promotion can be bought. */
  enabled: boolean;
  /** Owner 2026-10-05: post promotion (Instagram-style boost) can be bought. */
  postsEnabled: boolean;
  /** Default daily budget in the app; also the value of one referral
   * "free promotion day". */
  priceCentsPerDay: number;
  maxDays: number;
  maxActivePerCase: number;
  /** Owner 2026-10-05: price of 1 000 impressions — reach is budget ÷ CPM. */
  cpmCents: number;
  minDailyBudgetCents: number;
  maxDailyBudgetCents: number;
  /** Quick-pick daily budgets in the app. */
  budgetPresetsCents: number[];
  /** Quick-pick durations (days) in the app. */
  durationPresets: number[];
  /** A promoted post goes after every N-th organic post in the feed. */
  feedEveryN: number;
  /** Promoted cases on top of an attorney's first case-feed page. */
  caseFeedSlots: number;
  /** One person sees the same promotion at most this many times a day. */
  frequencyCapPerDay: number;
  /** Average impressions per reached person (for the reach estimate). */
  impressionsPerPerson: number;
  /** New promotions start without a staff check (only automatic checks). */
  autoApprove: boolean;
  /** Off by default: promotion needs no subscription (owner 2026-10-05).
   * On: only plans with the `case_promotion` term may promote. */
  requireSubscription: boolean;
  /** Owner 2026-10-07: what a boost is paid for, per promotable thing. */
  pricing: PricingMatrix;
}

/** Owner 2026-10-07: impressions / people are priced per 1000, taps and
 * real actions per one. */
export const BILLING_MODELS = [
  'impressions',
  'reach',
  'clicks',
  'actions',
] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];

/** What has its own prices: posts, posts with a video, cases, attorney
 * profiles (profile delivery comes later; off until then). */
export const PRICING_TARGETS = ['post', 'video', 'case', 'profile'] as const;
export type PricingTarget = (typeof PRICING_TARGETS)[number];

/** What may count as a real result per thing. Never "hired" or "case
 * won": paying for a client would be fee-sharing (legal/attorney-trust). */
export const BOOST_ACTIONS: Record<PricingTarget, readonly string[]> = {
  post: ['follow', 'message', 'save', 'profile_open'],
  video: ['watched', 'follow', 'message', 'save'],
  case: ['bid', 'question', 'save'],
  profile: ['message', 'consultation', 'follow'],
};
/** Only the app can see these; the rest the server records itself. */
export const CLIENT_REPORTED_ACTIONS = ['watched', 'profile_open'] as const;
export type BoostAction = string;

export interface ModelPrice {
  enabled: boolean;
  priceCents: number;
}

export interface TargetPricing {
  enabled: boolean;
  models: Record<BillingModel, ModelPrice>;
  actions: string[];
}

export type PricingMatrix = Record<PricingTarget, TargetPricing>;

const price = (priceCents: number, enabled = true): ModelPrice => ({
  enabled,
  priceCents,
});

export const DEFAULT_PRICING: PricingMatrix = {
  post: {
    enabled: true,
    models: {
      impressions: price(500),
      reach: price(800),
      clicks: price(30),
      actions: price(150),
    },
    actions: ['follow', 'message'],
  },
  video: {
    enabled: true,
    models: {
      impressions: price(400),
      reach: price(700),
      clicks: price(25),
      actions: price(120),
    },
    actions: ['watched', 'follow'],
  },
  case: {
    enabled: true,
    models: {
      impressions: price(500),
      reach: price(800, false),
      clicks: price(40),
      actions: price(200),
    },
    actions: ['bid'],
  },
  profile: {
    enabled: false,
    models: {
      impressions: price(600),
      reach: price(900),
      clicks: price(50),
      actions: price(300),
    },
    actions: ['message', 'consultation'],
  },
};

export const DEFAULT_PROMOTION_SETTINGS: PromotionSettings = {
  enabled: true,
  postsEnabled: true,
  priceCentsPerDay: 1_000,
  maxDays: 30,
  maxActivePerCase: 1,
  cpmCents: 500,
  minDailyBudgetCents: 100,
  maxDailyBudgetCents: 100_000,
  budgetPresetsCents: [300, 500, 1_000, 2_500, 5_000],
  durationPresets: [1, 3, 7, 14, 30],
  feedEveryN: 6,
  caseFeedSlots: 3,
  frequencyCapPerDay: 3,
  impressionsPerPerson: 1.6,
  autoApprove: true,
  requireSubscription: false,
  pricing: DEFAULT_PRICING,
};

/** Promoted cases shown on top of an attorney's first feed page. */
export const PROMOTED_FEED_SLOTS = 3;
/** Stripe's smallest USD charge. */
export const MIN_CHARGE_CENTS = 50;
/** Unpaid checkouts are given up after this long (Stripe: 24 h). */
export const PENDING_PAYMENT_TTL_MS = 24 * 3_600_000;

export const PROMOTION_STATUSES = [
  'pending_payment',
  'pending_review',
  'active',
  'finished',
  'canceled',
  'refunded',
  'rejected',
] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const PROMOTION_TARGETS = ['case', 'post'] as const;
export type PromotionTarget = (typeof PROMOTION_TARGETS)[number];

/** Who a promoted post is shown to; empty lists = everyone. */
export interface PromotionAudience {
  /** all | attorneys | clients */
  role: 'all' | 'attorneys' | 'clients';
  /** US state codes (attorney licence / client state). */
  states: string[];
  /** Country codes (users.country_code). */
  countries: string[];
  /** Practice category codes (attorney practice / client cases). */
  topics: string[];
}

export const EMPTY_AUDIENCE: PromotionAudience = {
  role: 'all',
  states: [],
  countries: [],
  topics: [],
};

const codes = (v: unknown, re: RegExp, max: number): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim())
            .filter((x) => re.test(x)),
        ),
      ].slice(0, max)
    : [];

export function parseAudience(raw: unknown): PromotionAudience {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_AUDIENCE };
  }
  const r = raw as Record<string, unknown>;
  return {
    role:
      r.role === 'attorneys' || r.role === 'clients'
        ? r.role
        : ('all' as const),
    states: codes(r.states, /^[A-Z]{2}$/, 60),
    countries: codes(r.countries, /^[A-Z]{2}$/, 50),
    topics: codes(r.topics, /^[a-z0-9_]{1,40}$/, 30),
  };
}

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : null;

const intList = (
  v: unknown,
  min: number,
  max: number,
  fallback: number[],
): number[] => {
  if (!Array.isArray(v)) return [...fallback];
  const list = [
    ...new Set(v.map((x) => int(x, min, max)).filter((x) => x !== null)),
  ].sort((a, b) => a - b);
  return list.length ? list.slice(0, 8) : [...fallback];
};

/**
 * Owner 2026-10-07. A stored row without `pricing` (before this change)
 * keeps what it had: the post / case switches and the CPM become the
 * impressions price, the other models start off.
 */
export function parsePricing(
  raw: unknown,
  legacy: { postsEnabled: boolean; casesEnabled: boolean; cpmCents: number },
): PricingMatrix {
  const r =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const out = {} as PricingMatrix;
  for (const t of PRICING_TARGETS) {
    const d = DEFAULT_PRICING[t];
    const tr =
      r && r[t] && typeof r[t] === 'object' && !Array.isArray(r[t])
        ? (r[t] as Record<string, unknown>)
        : null;
    if (!tr) {
      const on =
        t === 'case'
          ? legacy.casesEnabled
          : t === 'profile'
            ? false
            : legacy.postsEnabled;
      out[t] = {
        enabled: on,
        models: {
          impressions: price(
            t === 'profile' ? d.models.impressions.priceCents : legacy.cpmCents,
          ),
          reach: { ...d.models.reach, enabled: false },
          clicks: { ...d.models.clicks, enabled: false },
          actions: { ...d.models.actions, enabled: false },
        },
        actions: [...d.actions],
      };
      continue;
    }
    const mr =
      tr.models && typeof tr.models === 'object' && !Array.isArray(tr.models)
        ? (tr.models as Record<string, unknown>)
        : {};
    const models = {} as Record<BillingModel, ModelPrice>;
    for (const m of BILLING_MODELS) {
      const x =
        mr[m] && typeof mr[m] === 'object'
          ? (mr[m] as Record<string, unknown>)
          : {};
      models[m] = {
        enabled:
          typeof x.enabled === 'boolean' ? x.enabled : d.models[m].enabled,
        priceCents: int(x.priceCents, 1, 10_000_000) ?? d.models[m].priceCents,
      };
    }
    const allowed = BOOST_ACTIONS[t];
    const actions = Array.isArray(tr.actions)
      ? [
          ...new Set(
            tr.actions.filter(
              (a): a is string => typeof a === 'string' && allowed.includes(a),
            ),
          ),
        ]
      : [...d.actions];
    // No action chosen = nothing could ever be billed: model off.
    if (actions.length === 0) models.actions.enabled = false;
    out[t] = {
      enabled: typeof tr.enabled === 'boolean' ? tr.enabled : d.enabled,
      models,
      actions,
    };
  }
  return out;
}

/** The pricing key of a promotion target (a post with a video → video). */
export function pricingTargetOf(
  target: PromotionTarget,
  hasVideo = false,
): PricingTarget {
  return target === 'post' ? (hasVideo ? 'video' : 'post') : target;
}

/** Models a buyer can pick for [t]: on, in the admin's order. */
export function offersFor(
  pricing: PricingMatrix,
  t: PricingTarget,
): { billing: BillingModel; priceCents: number }[] {
  const p = pricing[t];
  if (!p.enabled) return [];
  return BILLING_MODELS.filter((m) => p.models[m].enabled).map((m) => ({
    billing: m,
    priceCents: p.models[m].priceCents,
  }));
}

/** Units a budget buys: per 1000 for impressions / people, else one. */
export function unitsFor(
  billing: BillingModel,
  budgetCents: number,
  priceCents: number,
): number {
  const per = Math.max(1, priceCents);
  return billing === 'impressions' || billing === 'reach'
    ? Math.max(1, Math.floor((budgetCents * 1000) / per))
    : Math.max(1, Math.floor(budgetCents / per));
}

export function parsePromotionSettings(raw: unknown): PromotionSettings {
  const d = DEFAULT_PROMOTION_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const bool = (v: unknown, f: boolean) => (typeof v === 'boolean' ? v : f);
  const minDaily =
    int(r.minDailyBudgetCents, MIN_CHARGE_CENTS, 1_000_000) ??
    d.minDailyBudgetCents;
  const maxDaily = Math.max(
    minDaily,
    int(r.maxDailyBudgetCents, MIN_CHARGE_CENTS, 10_000_000) ??
      d.maxDailyBudgetCents,
  );
  const maxDays = int(r.maxDays, 1, 365) ?? d.maxDays;
  const ipp =
    typeof r.impressionsPerPerson === 'number' &&
    r.impressionsPerPerson >= 1 &&
    r.impressionsPerPerson <= 10
      ? r.impressionsPerPerson
      : d.impressionsPerPerson;
  return {
    priceCentsPerDay:
      int(r.priceCentsPerDay, MIN_CHARGE_CENTS, 1_000_000) ??
      d.priceCentsPerDay,
    maxDays,
    maxActivePerCase: int(r.maxActivePerCase, 1, 1) ?? d.maxActivePerCase,
    minDailyBudgetCents: minDaily,
    maxDailyBudgetCents: maxDaily,
    budgetPresetsCents: intList(
      r.budgetPresetsCents,
      minDaily,
      maxDaily,
      d.budgetPresetsCents.filter((c) => c >= minDaily && c <= maxDaily).length
        ? d.budgetPresetsCents.filter((c) => c >= minDaily && c <= maxDaily)
        : [minDaily],
    ),
    durationPresets: intList(
      r.durationPresets,
      1,
      maxDays,
      d.durationPresets.filter((x) => x <= maxDays).length
        ? d.durationPresets.filter((x) => x <= maxDays)
        : [1],
    ),
    feedEveryN: int(r.feedEveryN, 2, 50) ?? d.feedEveryN,
    caseFeedSlots: int(r.caseFeedSlots, 0, 10) ?? d.caseFeedSlots,
    frequencyCapPerDay:
      int(r.frequencyCapPerDay, 1, 50) ?? d.frequencyCapPerDay,
    impressionsPerPerson: ipp,
    autoApprove: bool(r.autoApprove, d.autoApprove),
    requireSubscription: bool(r.requireSubscription, d.requireSubscription),
    ...syncLegacy(
      parsePricing(r.pricing, {
        postsEnabled: bool(r.postsEnabled, d.postsEnabled),
        casesEnabled: bool(r.enabled, d.enabled),
        cpmCents: int(r.cpmCents, 1, 1_000_000) ?? d.cpmCents,
      }),
    ),
  };
}

/** The old switches and CPM follow the pricing (older readers, stats). */
function syncLegacy(pricing: PricingMatrix): {
  pricing: PricingMatrix;
  enabled: boolean;
  postsEnabled: boolean;
  cpmCents: number;
} {
  return {
    pricing,
    enabled: offersFor(pricing, 'case').length > 0,
    postsEnabled:
      offersFor(pricing, 'post').length > 0 ||
      offersFor(pricing, 'video').length > 0,
    cpmCents: pricing.post.models.impressions.priceCents,
  };
}

/** Impressions a budget buys: budget ÷ CPM × 1000 (at least 1). */
export function impressionsFor(budgetCents: number, cpmCents: number): number {
  return Math.max(1, Math.floor((budgetCents * 1000) / Math.max(1, cpmCents)));
}

/** "About N people": a ±20 % range around impressions ÷ per-person. */
export function reachRange(
  impressions: number,
  impressionsPerPerson: number,
): { min: number; max: number } {
  const mid = impressions / Math.max(1, impressionsPerPerson);
  return {
    min: Math.max(1, Math.floor(mid * 0.8)),
    max: Math.max(1, Math.ceil(mid * 1.2)),
  };
}

export interface PromoDiscount {
  id: string;
  discountType: 'percent' | 'amount' | 'free_days';
  percentOff: number | null;
  amountOffCents: number | null;
  freeDays: number | null;
}

export interface PromotionQuote {
  days: number;
  priceCentsPerDay: number;
  grossCents: number;
  creditDaysUsed: number;
  promoDiscountCents: number;
  totalCents: number;
}

/**
 * Price of [days]: referral credit days first, then the promo code on the
 * remaining days; a non-zero charge is at least Stripe's minimum.
 */
export function quotePromotion(input: {
  days: number;
  priceCentsPerDay: number;
  creditDaysAvailable: number;
  useCredits: boolean;
  promo?: PromoDiscount | null;
  /** Owner 2026-10-05: what one free referral day is worth (the daily
   * budget is now chosen freely); default = the whole daily budget. */
  creditDayValueCents?: number;
}): PromotionQuote {
  const { days, priceCentsPerDay } = input;
  const grossCents = days * priceCentsPerDay;
  // Referral credit may be fractional (owner 2026-10-05: «0.5 дня»).
  const creditDaysUsed = input.useCredits
    ? Math.round(Math.max(0, Math.min(days, input.creditDaysAvailable)) * 100) /
      100
    : 0;
  const creditDay = Math.min(
    priceCentsPerDay,
    input.creditDayValueCents ?? priceCentsPerDay,
  );
  const payableCents = Math.max(
    0,
    Math.round(grossCents - creditDaysUsed * creditDay),
  );
  let promoDiscountCents = 0;
  const promo = input.promo;
  if (promo && payableCents > 0) {
    if (promo.discountType === 'percent' && promo.percentOff) {
      promoDiscountCents = Math.round(
        (payableCents * Math.min(100, promo.percentOff)) / 100,
      );
    } else if (promo.discountType === 'amount' && promo.amountOffCents) {
      promoDiscountCents = Math.min(payableCents, promo.amountOffCents);
    } else if (promo.discountType === 'free_days' && promo.freeDays) {
      promoDiscountCents = Math.min(
        payableCents,
        Math.round(
          Math.min(days - creditDaysUsed, promo.freeDays) * priceCentsPerDay,
        ),
      );
    }
  }
  let totalCents = Math.max(0, payableCents - promoDiscountCents);
  if (totalCents > 0 && totalCents < MIN_CHARGE_CENTS) {
    totalCents = MIN_CHARGE_CENTS;
    promoDiscountCents = payableCents - totalCents;
  }
  return {
    days,
    priceCentsPerDay,
    grossCents,
    creditDaysUsed,
    promoDiscountCents,
    totalCents,
  };
}

/** What a stored promotion counts toward its budget. */
export interface DeliveryCounts {
  billing: string;
  impressions: number;
  reach: number;
  clicks: number;
  actions: number;
  target_units: number | null;
  target_impressions: number | null;
}

export const billingOf = (raw: string): BillingModel =>
  (BILLING_MODELS as readonly string[]).includes(raw)
    ? (raw as BillingModel)
    : 'impressions';

/** Units delivered in the promotion's own unit. */
export function deliveredUnits(p: DeliveryCounts): number {
  switch (billingOf(p.billing)) {
    case 'reach':
      return p.reach;
    case 'clicks':
      return p.clicks;
    case 'actions':
      return p.actions;
    default:
      return p.impressions;
  }
}

/** Units the budget buys (older rows: their impressions cap). */
export const targetUnits = (p: DeliveryCounts): number | null =>
  p.target_units ?? p.target_impressions;

/** The budget is used up. */
export function budgetSpent(p: DeliveryCounts): boolean {
  const t = targetUnits(p);
  return t !== null && deliveredUnits(p) >= t;
}

/** Cents of [paidCents] not used yet: the undelivered share. */
export function unspentCents(
  p: DeliveryCounts & { total_cents: number; refunded_cents: number },
): number {
  const left = Math.max(0, p.total_cents - p.refunded_cents);
  const t = targetUnits(p);
  if (!t) return 0;
  const undelivered = Math.max(0, t - deliveredUnits(p));
  return Math.min(left, Math.floor((p.total_cents * undelivered) / t));
}
