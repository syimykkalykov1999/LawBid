/**
 * Owner 2026-10-05: partner (affiliate) program — "блогер приводит
 * адвокатов и клиентов, я плачу за каждого, кто купил подписку / нанял
 * адвоката". Program-wide defaults live in ONE app_config row
 * (`partners.program`); every partner can override the rates, the client
 * rule and the hold. A missing or malformed row falls back field by field.
 */
export const PARTNER_SETTINGS_KEY = 'partners.program';

/**
 * Owner 2026-10-05 (legal): version of the partner rules (the
 * `partnerTerms` text in legal.settings). A partner accepts a version;
 * bump it when the rules change materially so everyone re-accepts.
 */
export const PARTNER_TERMS_VERSION = '2026-10-05';

/** When a referred CLIENT earns the partner a commission. */
export const CLIENT_RULES = ['case_published', 'bid_accepted'] as const;
export type ClientRule = (typeof CLIENT_RULES)[number];

export const JOIN_MODES = ['open', 'approval', 'closed'] as const;
export type JoinMode = (typeof JOIN_MODES)[number];

/** pending = asked to join, waits for the admin (joinMode 'approval'). */
export const PARTNER_STATUSES = [
  'pending',
  'active',
  'paused',
  'ended',
] as const;
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
  /** Off: the section disappears from the app, partner codes stop
   * attributing and nothing new accrues; earned amounts stay. */
  enabled: boolean;
  /**
   * How attorneys and clients join from Settings (owner 2026-10-05: "в
   * профилях тоже нужно сделать"): open = link at once; approval = a
   * request the admin approves; closed = only the admin adds partners.
   */
  joinMode: JoinMode;
  /** Per referred attorney whose first paid subscription invoice succeeded. */
  attorneyRateCents: number;
  /** Per referred client who met [clientRule]. */
  clientRateCents: number;
  clientRule: ClientRule;
  /** Anti-fraud hold before an accrual can be paid; 0 = approve at once. */
  holdDays: number;
  /** Owner 2026-10-05 (legal): a W-9 (or W-8) must be on file before the
   * first payout (IRS 1099-NEC reporting from $600 a year). */
  requireW9: boolean;
  texts: PartnerTextsByLang;
}

export const MAX_RATE_CENTS = 1_000_000; // $10 000
export const MAX_HOLD_DAYS = 180;

export const DEFAULT_PARTNER_TEXTS: PartnerTextsByLang = {
  en: {
    title: 'Partner program',
    summary:
      'Share your link. You earn a fixed amount for every attorney who buys a subscription and for every client who joins and becomes active on LawBid (the exact event is shown in the rates below). Earnings are held for a short check and then paid out.',
  },
  ru: {
    title: 'Партнёрская программа',
    summary:
      'Делитесь своей ссылкой. Вы получаете фиксированную сумму за каждого адвоката, купившего подписку, и за каждого клиента, который присоединился и стал активным в LawBid (точное событие указано в ставках ниже). Начисления проходят короткую проверку и затем выплачиваются.',
  },
};

export const DEFAULT_PARTNER_SETTINGS: PartnerProgramSettings = {
  enabled: true,
  joinMode: 'open',
  attorneyRateCents: 5_000, // $50 per paying attorney
  clientRateCents: 1_000, // $10 per client who became active
  // Owner 2026-10-05 (legal): the safe default is the client's first
  // published case, never the hire. A payment that depends on a client
  // *hiring* an attorney reads as paid referral of legal work ("running
  // and capping"), which is forbidden to non-lawyers in several states
  // (CA Bus. & Prof. Code §6152, TX Penal Code §38.12). The admin may
  // still pick bid_accepted knowingly.
  clientRule: 'case_published',
  holdDays: 14,
  requireW9: true,
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
    joinMode: (JOIN_MODES as readonly string[]).includes(r.joinMode as string)
      ? (r.joinMode as JoinMode)
      : d.joinMode,
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
    requireW9: typeof r.requireW9 === 'boolean' ? r.requireW9 : d.requireW9,
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
