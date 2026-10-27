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
  /** A promoted post goes after every N-th organic post in the feed
   * (owner 2026-10-15: 10–15, default 12). */
  feedEveryN: number;
  /** Owner 2026-10-15: the Boost buttons — a master switch, then per role
   * (attorney / client) and per content type (post / reel / case). They
   * hide at once, no release needed. */
  boostEnabled: boolean;
  attorneysEnabled: boolean;
  clientsEnabled: boolean;
  /** The same for reels: one promoted reel in N (own counter, 10–15). */
  reelEveryN: number;
  /** Video posts (reels) can be boosted and are shown among reels. */
  reelsEnabled: boolean;
  /** A promoted post may carry a button (the types below). */
  ctaEnabled: boolean;
  /** Which buttons an advertiser can pick: more | message | profile |
   * download | call. */
  ctaTypes: string[];
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
  /** Owner 2026-10-27: what a boost is paid for, per thing (post, video,
   * case, attorney profile): views / people / taps / real actions. */
  pricing: PricingMatrix;
}

/**
 * Owner 2026-10-27 (rewrite of #112 on the rebuilt Boost). A boost is paid
 * for one of four things: `impressions` (views, price per 1 000), `reach`
 * (people, price per 1 000), `clicks` (taps, each) or `actions` (real
 * actions, each). The stored value is the column `case_promotions.billing`.
 */
export const BILLING_MODELS = [
  'impressions',
  'reach',
  'clicks',
  'actions',
] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];

/** What has its own prices: posts, posts with a video, cases, attorney
 * profiles (profile delivery is not built yet: prices only). */
export const PRICING_TARGETS = ['post', 'video', 'case', 'profile'] as const;
export type PricingTarget = (typeof PRICING_TARGETS)[number];

/**
 * What the owner may count as a real action, per thing. Never «hired» or
 * «case won»: paying for a client is fee-sharing (attorney-trust rules).
 */
export const BOOST_ACTIONS: Record<PricingTarget, readonly string[]> = {
  post: ['follow', 'message', 'save', 'profile_open', 'call'],
  video: ['watched', 'follow', 'message', 'save', 'profile_open', 'call'],
  case: ['bid', 'question', 'save'],
  profile: ['follow', 'message', 'call'],
};
/** Only the app can see these; the server sees the rest by itself. */
export const CLIENT_REPORTED_ACTIONS = [
  'watched',
  'profile_open',
  'call',
] as const;
export type BoostAction = string;

export interface ModelPrice {
  enabled: boolean;
  priceCents: number;
}

export interface TargetPricing {
  models: Record<BillingModel, ModelPrice>;
  /** Which actions count when the model is `actions`. */
  actions: string[];
}

export type PricingMatrix = Record<PricingTarget, TargetPricing>;

const price = (priceCents: number, enabled = false): ModelPrice => ({
  enabled,
  priceCents,
});

/**
 * Views keep today's behaviour (on, at the old CPM); every new model is OFF
 * until the owner switches it on. The prices of the off models are only
 * starting values.
 */
export const DEFAULT_PRICING: PricingMatrix = {
  post: {
    models: {
      impressions: price(500, true),
      reach: price(800),
      clicks: price(30),
      actions: price(150),
    },
    actions: ['follow', 'message'],
  },
  video: {
    models: {
      impressions: price(500, true),
      reach: price(800),
      clicks: price(25),
      actions: price(120),
    },
    actions: ['watched', 'follow'],
  },
  case: {
    models: {
      impressions: price(500, true),
      reach: price(800),
      clicks: price(40),
      actions: price(200),
    },
    actions: ['bid'],
  },
  profile: {
    models: {
      impressions: price(600),
      reach: price(900),
      clicks: price(50),
      actions: price(300),
    },
    actions: ['follow', 'message'],
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
  feedEveryN: 12,
  reelEveryN: 12,
  boostEnabled: true,
  attorneysEnabled: true,
  clientsEnabled: true,
  reelsEnabled: true,
  ctaEnabled: true,
  ctaTypes: ['more', 'message', 'profile', 'call'],
  caseFeedSlots: 3,
  frequencyCapPerDay: 3,
  impressionsPerPerson: 1.6,
  autoApprove: true,
  requireSubscription: false,
  pricing: DEFAULT_PRICING,
};

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

/** Owner 2026-10-15: the buttons under a promoted post. Owner 2026-10-19:
 * no «Download» — a file link from an ad can carry a virus to our users; it
 * is no longer offered, accepted or shown (RETIRED_PROMOTION_CTA_TYPES). */
export const PROMOTION_CTA_TYPES: string[] = [
  'more',
  'message',
  'profile',
  'call',
];

/** Button types an older promotion may still carry: shown without them. */
export const RETIRED_PROMOTION_CTA_TYPES: string[] = ['download'];
export const PROMOTION_GOALS = ['views', 'clicks', 'messages', 'followers'];

/** Links an advertiser may not use: shorteners and messengers (the site
 * is checked by the moderation, a redirect can hide anything). */
const BLOCKED_HOSTS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'cutt.ly',
  'rb.gy',
  'wa.me',
  'api.whatsapp.com',
  'whatsapp.com',
  't.me',
  'telegram.me',
  'telegram.org',
  'm.me',
  'discord.gg',
  'viber.com',
  'signal.me',
];

/** An https link to a real site: no shorteners, no messengers, no IPs. */
export function isAllowedAdLink(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || /^\d+(\.\d+){3}$/.test(host)) return false;
  return !BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
}
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
 * Reads the stored price matrix. A missing target (older rows have no
 * `pricing` at all) starts from the defaults, with the views price = the
 * old single CPM, so nothing changes for the buyer until the owner edits it.
 */
export function parsePricing(
  raw: unknown,
  legacyCpmCents: number,
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
    const mr =
      tr?.models && typeof tr.models === 'object' && !Array.isArray(tr.models)
        ? (tr.models as Record<string, unknown>)
        : {};
    const models = {} as Record<BillingModel, ModelPrice>;
    for (const m of BILLING_MODELS) {
      const x =
        mr[m] && typeof mr[m] === 'object' && !Array.isArray(mr[m])
          ? (mr[m] as Record<string, unknown>)
          : {};
      const fallback =
        m === 'impressions' && t !== 'profile'
          ? legacyCpmCents
          : d.models[m].priceCents;
      models[m] = {
        enabled:
          typeof x.enabled === 'boolean' ? x.enabled : d.models[m].enabled,
        priceCents: int(x.priceCents, 1, 10_000_000) ?? fallback,
      };
    }
    const allowed = BOOST_ACTIONS[t];
    const actions = Array.isArray(tr?.actions)
      ? [
          ...new Set(
            (tr.actions as unknown[]).filter(
              (a): a is string => typeof a === 'string' && allowed.includes(a),
            ),
          ),
        ]
      : [...d.actions];
    // No action chosen = nothing could ever be billed: the model is off.
    if (actions.length === 0) models.actions.enabled = false;
    out[t] = { models, actions };
  }
  return out;
}

/**
 * A partial matrix from the admin applied on the stored one: only the
 * targets / models / fields that were sent change; the result is read back
 * through parsePricing, so it is always valid.
 */
export function mergePricing(
  base: PricingMatrix,
  patch: unknown,
  legacyCpmCents: number,
): PricingMatrix {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const pr = patch as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  for (const t of PRICING_TARGETS) {
    const b = base[t];
    const x = pr[t];
    if (!x || typeof x !== 'object' || Array.isArray(x)) {
      merged[t] = b;
      continue;
    }
    const xr = x as Record<string, unknown>;
    const xm =
      xr.models && typeof xr.models === 'object' && !Array.isArray(xr.models)
        ? (xr.models as Record<string, unknown>)
        : {};
    const models: Record<string, unknown> = {};
    for (const m of BILLING_MODELS) {
      const mm = xm[m];
      models[m] =
        mm && typeof mm === 'object' && !Array.isArray(mm)
          ? { ...b.models[m], ...mm }
          : b.models[m];
    }
    merged[t] = { models, actions: xr.actions ?? b.actions };
  }
  return parsePricing(merged, legacyCpmCents);
}

/** The pricing key of a promotion target (a post with a video → video). */
export function pricingTargetOf(
  target: PromotionTarget,
  hasVideo = false,
): PricingTarget {
  return target === 'post' ? (hasVideo ? 'video' : 'post') : 'case';
}

/** Ways to pay a buyer can pick for [t]: the ones switched on, in order. */
export function offersFor(
  pricing: PricingMatrix,
  t: PricingTarget,
): { billing: BillingModel; priceCents: number }[] {
  const p = pricing[t];
  return BILLING_MODELS.filter((m) => p.models[m].enabled).map((m) => ({
    billing: m,
    priceCents: p.models[m].priceCents,
  }));
}

/** Units a budget buys: per 1 000 for views / people, else per one. */
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...d, pricing: parsePricing(null, d.cpmCents) };
  }
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
  // The old single CPM is the views price until `pricing` says otherwise.
  const pricing = parsePricing(
    r.pricing,
    int(r.cpmCents, 1, 1_000_000) ?? d.cpmCents,
  );
  const ipp =
    typeof r.impressionsPerPerson === 'number' &&
    r.impressionsPerPerson >= 1 &&
    r.impressionsPerPerson <= 10
      ? r.impressionsPerPerson
      : d.impressionsPerPerson;
  return {
    enabled: bool(r.enabled, d.enabled),
    postsEnabled: bool(r.postsEnabled, d.postsEnabled),
    priceCentsPerDay:
      int(r.priceCentsPerDay, MIN_CHARGE_CENTS, 1_000_000) ??
      d.priceCentsPerDay,
    maxDays,
    maxActivePerCase: int(r.maxActivePerCase, 1, 1) ?? d.maxActivePerCase,
    cpmCents: pricing.post.models.impressions.priceCents,
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
    feedEveryN: int(r.feedEveryN, 10, 15) ?? d.feedEveryN,
    reelEveryN: int(r.reelEveryN, 10, 15) ?? d.reelEveryN,
    boostEnabled: bool(r.boostEnabled, d.boostEnabled),
    attorneysEnabled: bool(r.attorneysEnabled, d.attorneysEnabled),
    clientsEnabled: bool(r.clientsEnabled, d.clientsEnabled),
    reelsEnabled: bool(r.reelsEnabled, d.reelsEnabled),
    ctaEnabled: bool(r.ctaEnabled, d.ctaEnabled),
    ctaTypes: Array.isArray(r.ctaTypes)
      ? [
          ...new Set(
            r.ctaTypes.filter(
              (x): x is string =>
                typeof x === 'string' && PROMOTION_CTA_TYPES.includes(x),
            ),
          ),
        ]
      : [...d.ctaTypes],
    caseFeedSlots: int(r.caseFeedSlots, 0, 10) ?? d.caseFeedSlots,
    frequencyCapPerDay:
      int(r.frequencyCapPerDay, 1, 50) ?? d.frequencyCapPerDay,
    impressionsPerPerson: ipp,
    autoApprove: bool(r.autoApprove, d.autoApprove),
    requireSubscription: bool(r.requireSubscription, d.requireSubscription),
    pricing,
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

/** The counter column that measures a model. */
export type UnitField = 'impressions' | 'reach' | 'clicks' | 'actions';
export const unitField = (billing: string): UnitField => billingOf(billing);

/** Units delivered, in the unit the promotion is paid for. */
export function deliveredUnits(p: DeliveryCounts): number {
  return p[unitField(p.billing)];
}

/** Units the budget buys (older rows: their impressions cap). */
export const targetUnits = (p: DeliveryCounts): number | null =>
  p.target_units ?? p.target_impressions;

/** The budget is used up. */
export function budgetSpent(p: DeliveryCounts): boolean {
  const t = targetUnits(p);
  return t !== null && deliveredUnits(p) >= t;
}

/** Cents of the paid amount not used yet: the undelivered share. */
export function unspentShare(
  p: DeliveryCounts,
  paid: number,
  alreadyBack: number,
): number {
  const left = Math.max(0, paid - alreadyBack);
  const t = targetUnits(p);
  if (!t) return 0;
  const undelivered = Math.max(0, t - deliveredUnits(p));
  return Math.min(left, Math.floor((paid * undelivered) / t));
}
