/**
 * Owner 2026-10-05: partner (affiliate) program — "блогер приводит
 * адвокатов и клиентов, я плачу за каждого, кто купил подписку / нанял
 * адвоката". Program-wide defaults live in ONE app_config row
 * (`partners.program`); every partner can override the rates, the client
 * rule and the hold. A missing or malformed row falls back field by field.
 */
export const PARTNER_SETTINGS_KEY = 'partners.program';

/** When a referred CLIENT earns the partner a commission. */
export const CLIENT_RULES = ['case_published', 'bid_accepted'] as const;
export type ClientRule = (typeof CLIENT_RULES)[number];

export const PARTNER_STATUSES = ['active', 'paused', 'ended'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const COMMISSION_KINDS = [
  'attorney_subscription',
  'client_qualified',
  'monthly_base',
  'adjustment',
] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

export const COMMISSION_STATUSES = [
  'held',
  'approved',
  'paid',
  'reversed',
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const PARTNER_LANGS = ['en', 'ru'] as const;
export type PartnerLang = (typeof PARTNER_LANGS)[number];

export interface PartnerTexts {
  title: string;
  summary: string;
}
export type PartnerTextsByLang = Record<PartnerLang, PartnerTexts>;
export const PARTNER_TEXT_LIMITS = { title: 80, summary: 600 } as const;

export interface PartnerProgramSettings {
  enabled: boolean;
  /** Per referred attorney whose first paid subscription invoice succeeded. */
  attorneyRateCents: number;
  /** Per referred client who met [clientRule]. */
  clientRateCents: number;
  clientRule: ClientRule;
  /** Anti-fraud hold before an accrual can be paid; 0 = approve at once. */
  holdDays: number;
  texts: PartnerTextsByLang;
}

export const MAX_RATE_CENTS = 1_000_000; // $10 000
export const MAX_HOLD_DAYS = 180;

export const DEFAULT_PARTNER_TEXTS: PartnerTextsByLang = {
  en: {
    title: 'Partner program',
    summary:
      'Share your link. You earn a fixed amount for every attorney who buys a subscription and every client who hires an attorney through LawBid. Earnings are held for a short check and then paid out.',
  },
  ru: {
    title: 'Партнёрская программа',
    summary:
      'Делитесь своей ссылкой. Вы получаете фиксированную сумму за каждого адвоката, купившего подписку, и за каждого клиента, нанявшего адвоката через LawBid. Начисления проходят короткую проверку и затем выплачиваются.',
  },
};

export const DEFAULT_PARTNER_SETTINGS: PartnerProgramSettings = {
  enabled: true,
  attorneyRateCents: 5_000, // $50 per paying attorney
  clientRateCents: 1_000, // $10 per client who hired
  clientRule: 'bid_accepted',
  holdDays: 14,
  texts: DEFAULT_PARTNER_TEXTS,
};

const nonNegInt = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

export function parsePartnerTexts(raw: unknown): PartnerTextsByLang {
  const out = {} as PartnerTextsByLang;
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  for (const lang of PARTNER_LANGS) {
    const l = src[lang];
    const o =
      l && typeof l === 'object' && !Array.isArray(l)
        ? (l as Record<string, unknown>)
        : {};
    const d = DEFAULT_PARTNER_TEXTS[lang];
    const pick = (k: keyof PartnerTexts): string => {
      const v = o[k];
      return typeof v === 'string' && v.trim() !== '' ? v : d[k];
    };
    out[lang] = { title: pick('title'), summary: pick('summary') };
  }
  return out;
}

/** Stored JSON → settings, defaulting every missing/invalid field. */
export function parsePartnerSettings(raw: unknown): PartnerProgramSettings {
  const d = DEFAULT_PARTNER_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    attorneyRateCents: nonNegInt(r.attorneyRateCents, MAX_RATE_CENTS)
      ? r.attorneyRateCents
      : d.attorneyRateCents,
    clientRateCents: nonNegInt(r.clientRateCents, MAX_RATE_CENTS)
      ? r.clientRateCents
      : d.clientRateCents,
    clientRule: (CLIENT_RULES as readonly string[]).includes(
      r.clientRule as string,
    )
      ? (r.clientRule as ClientRule)
      : d.clientRule,
    holdDays: nonNegInt(r.holdDays, MAX_HOLD_DAYS) ? r.holdDays : d.holdDays,
    texts: parsePartnerTexts(r.texts),
  };
}

/** `YYYY-MM` (UTC) a date belongs to — the payroll period. */
export function periodOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Effective rates of a partner: own values, else program defaults. */
export function effectiveRates(
  settings: PartnerProgramSettings,
  partner: {
    attorney_rate_cents: number | null;
    client_rate_cents: number | null;
    monthly_base_cents: number;
    client_rule: string | null;
    hold_days: number | null;
  },
): {
  attorneyRateCents: number;
  clientRateCents: number;
  monthlyBaseCents: number;
  clientRule: ClientRule;
  holdDays: number;
} {
  return {
    attorneyRateCents:
      partner.attorney_rate_cents ?? settings.attorneyRateCents,
    clientRateCents: partner.client_rate_cents ?? settings.clientRateCents,
    monthlyBaseCents: partner.monthly_base_cents,
    clientRule: (CLIENT_RULES as readonly string[]).includes(
      partner.client_rule ?? '',
    )
      ? (partner.client_rule as ClientRule)
      : settings.clientRule,
    holdDays: partner.hold_days ?? settings.holdDays,
  };
}
