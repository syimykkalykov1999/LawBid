import type { CostProvider } from './cost-guard.constants';

/**
 * Owner 2026-10-22 (audit #4 §6): spend caps in money, not calls.
 * Every paid call is priced in MILLICENTS (1/1000 of a US cent) so a
 * translated character (0.002 ¢) and an identity check (150 ¢) share one
 * integer counter in Redis. Prices are list-price estimates (sources
 * below); the owner overrides any of them live in the admin
 * (`cost.unit_millicents.<provider>` and `cost.sms_millicents.<COUNTRY>`,
 * read by `parsePriceBook`). This is the ONE price book: the economy guard
 * (EconomyService) and the money brakes (CostGuardService) both read it.
 *
 * Sources (checked 2026-10): Google Cloud Translation $20 / 1 M characters;
 * AWS SES $0.10 / 1 000 e-mails; Stripe Identity $1.50 / verification;
 * S3 PUT $0.005 / 1 000 + image work ≈ $0.00005 / upload; Bunny Stream
 * storage + delivery ≈ $0.005 / video minute; AWS Rekognition image
 * moderation $0.001 / image; Twilio SMS per country (table below).
 */
export const UNIT_MILLICENTS: Record<CostProvider, number> = {
  /** Per message; the destination country decides (SMS_COUNTRY_TIERS). */
  sms: 1_150,
  email: 10,
  id_check: 150_000,
  storage: 5,
  /** Per character of source text. */
  translate: 2,
  /** Per started minute of video. */
  video: 500,
  image_moderation: 100,
};

/** What one call of each provider is assumed to weigh when the caller
 * gives no size: converts the old per-call caps (BUDGET_<P>_DAILY_MAX)
 * into a money cap. A translation is ~500 characters, a reel ~1 minute. */
export const NOMINAL_UNITS_PER_CALL: Record<CostProvider, number> = {
  sms: 1,
  email: 1,
  id_check: 1,
  storage: 1,
  translate: 500,
  video: 1,
  image_moderation: 1,
};

/**
 * Twilio outbound SMS list prices grouped in tiers (USD per segment,
 * carrier fees included, rounded up). A country not listed uses
 * `default` — deliberately high, so an unknown destination can't drain
 * the budget (SMS pumping fraud targets exactly those).
 */
export const SMS_TIER_MILLICENTS = {
  /** US, Canada, Puerto Rico: ~$0.0115 (Twilio list price with carrier fees). */
  a: 1_150,
  /** Most of Western Europe, Latin America, East Asia: ~$0.05–0.10. */
  b: 8_000,
  /** Expensive routes (Central Asia, Russia, parts of Africa / SE Asia):
   * ~$0.20–0.40. */
  c: 30_000,
  default: 10_000,
} as const;

const TIER_OF: Record<string, keyof typeof SMS_TIER_MILLICENTS> = {
  US: 'a',
  CA: 'a',
  PR: 'a',
  GB: 'b',
  IE: 'b',
  DE: 'b',
  FR: 'b',
  ES: 'b',
  IT: 'b',
  PT: 'b',
  NL: 'b',
  BE: 'b',
  AT: 'b',
  CH: 'b',
  SE: 'b',
  NO: 'b',
  DK: 'b',
  FI: 'b',
  PL: 'b',
  MX: 'b',
  BR: 'b',
  AR: 'b',
  CL: 'b',
  CO: 'b',
  JP: 'b',
  KR: 'b',
  AU: 'b',
  NZ: 'b',
  IL: 'b',
  IN: 'b',
  RU: 'c',
  KZ: 'c',
  KG: 'c',
  UZ: 'c',
  TJ: 'c',
  TM: 'c',
  AZ: 'c',
  BY: 'c',
  UA: 'c',
  ID: 'c',
  NG: 'c',
  EG: 'c',
  PK: 'c',
  BD: 'c',
  VN: 'c',
};

/** Millicents of one SMS to [country] (ISO-3166 alpha-2), with the
 * admin's per-country overrides applied first. */
export function smsMillicents(
  country: string | null | undefined,
  overrides: Record<string, number> = {},
): number {
  const c = (country ?? '').toUpperCase();
  const own = overrides[c];
  if (typeof own === 'number' && Number.isFinite(own) && own >= 0) return own;
  const tier = TIER_OF[c];
  return SMS_TIER_MILLICENTS[tier ?? 'default'];
}

export interface CostEstimateInput {
  units: number;
  /** translate: characters of source text. */
  chars?: number;
  /** sms: destination country. */
  country?: string | null;
  /** video: duration in seconds (rounded up to minutes). */
  seconds?: number;
}

/** Estimated millicents of one guarded call (pure, unit-tested). */
export function estimateMillicents(
  provider: CostProvider,
  input: CostEstimateInput,
  prices: {
    unit?: Partial<Record<CostProvider, number>>;
    sms?: Record<string, number>;
  } = {},
): number {
  const unit = prices.unit?.[provider] ?? UNIT_MILLICENTS[provider];
  switch (provider) {
    case 'sms':
      return input.units * smsMillicents(input.country, prices.sms);
    case 'translate':
      return (
        unit *
        Math.max(
          1,
          input.chars ?? input.units * NOMINAL_UNITS_PER_CALL.translate,
        )
      );
    case 'video': {
      const minutes = input.seconds
        ? Math.ceil(input.seconds / 60)
        : input.units * NOMINAL_UNITS_PER_CALL.video;
      return unit * Math.max(1, minutes);
    }
    default:
      return unit * input.units;
  }
}

/** The money cap a per-call cap stands for (keeps BUDGET_<P>_DAILY_MAX
 * meaningful): calls × nominal size × unit price. */
export function capMillicentsFromCalls(
  provider: CostProvider,
  calls: number,
  unit: Partial<Record<CostProvider, number>> = {},
): number {
  return (
    calls *
    NOMINAL_UNITS_PER_CALL[provider] *
    (unit[provider] ?? UNIT_MILLICENTS[provider])
  );
}

/** 1 US dollar in millicents (1 millicent = 1/1000 of a cent). */
export const MILLICENTS_PER_USD = 100_000;

export interface PriceBook {
  unit: Partial<Record<CostProvider, number>>;
  sms: Record<string, number>;
}

const isPrice = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * The admin's overrides out of the stored app_config rows (pure):
 * `cost.unit_millicents.<provider>` (one integer per provider),
 * `cost.sms_millicents.<COUNTRY>` (one integer per country) and, for a
 * hand-written row, the JSON forms `cost.unit_millicents` /
 * `cost.sms_country_millicents`. Malformed values are ignored (the list
 * price stays).
 */
export function parsePriceBook(stored: Record<string, unknown>): PriceBook {
  const book: PriceBook = { unit: {}, sms: {} };
  const json = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const unitJson = json(stored['cost.unit_millicents']);
  for (const p of Object.keys(UNIT_MILLICENTS) as CostProvider[]) {
    const v = stored[`cost.unit_millicents.${p}`] ?? unitJson[p];
    if (isPrice(v)) book.unit[p] = v;
  }
  for (const [c, v] of Object.entries(
    json(stored['cost.sms_country_millicents']),
  )) {
    if (isPrice(v)) book.sms[c.toUpperCase()] = v;
  }
  for (const [k, v] of Object.entries(stored)) {
    const m = /^cost\.sms_millicents\.([A-Za-z]{2})$/.exec(k);
    if (m && isPrice(v)) book.sms[m[1].toUpperCase()] = v;
  }
  return book;
}

/**
 * What ONE guarded call is assumed to cost, in US dollars: the same
 * numbers `consume()` reserves (unit price × nominal size of a call).
 * SMS has no country in a call counter, so it uses the unit price (the
 * US/Canada rate): the real destination mix comes from Twilio's own bill
 * (spend snapshot), this is only the fallback.
 */
export function unitUsdPerCall(
  provider: CostProvider,
  book: Partial<PriceBook> = {},
): number {
  const unit = book.unit?.[provider] ?? UNIT_MILLICENTS[provider];
  return (unit * NOMINAL_UNITS_PER_CALL[provider]) / MILLICENTS_PER_USD;
}
