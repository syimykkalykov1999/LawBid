/**
 * Owner 2026-10-02: referral program ("реферальные скидки для клиентов и
 * адвокатов"). The whole program lives in ONE app_config row
 * (`referrals.program`, a JSON object) edited from the admin
 * (GET/PUT /admin/referrals/settings); a missing or malformed row falls
 * back to these defaults field by field.
 */
export const REFERRAL_SETTINGS_KEY = 'referrals.program';

export const REWARD_TYPES = [
  'balance_cents',
  'percent_first_invoice',
  'promotion_days',
] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export interface ReferralReward {
  type: RewardType;
  value: number;
}

/** Stored on Referral.referrer_reward / referee_reward: the program's
 * reward at apply time plus bookkeeping (issue time, promotion-day uses
 * keyed by case promotion id). */
export interface ReferralRewardSnapshot extends ReferralReward {
  issuedAt?: string;
  uses?: Record<string, number>;
}

export interface ReferralProgramSettings {
  enabled: boolean;
  attorneyReferrerReward: ReferralReward;
  attorneyRefereeReward: ReferralReward;
  clientReferrerReward: ReferralReward;
  clientRefereeReward: ReferralReward;
  /** Days after sign-up during which a code can still be applied. */
  applyWindowDays: number;
  /** Most people one user can invite (rejected ones don't count); 0 = no limit. */
  maxInvitesPerReferrer: number;
  /** Words the owner writes: shown in the app, per language. */
  texts: ReferralTextsByLang;
}

export interface ReferralTexts {
  title: string;
  summary: string;
  terms: string;
  /** Share sheet text; {{code}} and {{url}} are filled in. */
  shareMessage: string;
}
export const REFERRAL_LANGS = ['en', 'ru'] as const;
export type ReferralLang = (typeof REFERRAL_LANGS)[number];
export type ReferralTextsByLang = Record<ReferralLang, ReferralTexts>;
export const REFERRAL_TEXT_LIMITS = {
  title: 80,
  summary: 400,
  terms: 5000,
  shareMessage: 400,
} as const;

export const DEFAULT_REFERRAL_TEXTS: ReferralTextsByLang = {
  en: {
    title: 'Invite friends to LawBid',
    summary:
      'Share your code. When your friend gets started, you both get a reward.',
    terms:
      'The reward is issued after the invited person makes their first paid subscription payment (attorneys) or publishes their first case (clients). One code per person, entered within the first days after sign-up. Self-invites and abuse are rejected.',
    shareMessage: 'Join me on LawBid! Use my code {{code}}: {{url}}',
  },
  ru: {
    title: 'Пригласите друзей в LawBid',
    summary:
      'Поделитесь кодом. Когда друг начнёт пользоваться, вы оба получите награду.',
    terms:
      'Награда выдаётся после первой оплаты подписки приглашённым адвокатом или первого опубликованного кейса приглашённым клиентом. Один код на человека, вводится в первые дни после регистрации. Приглашения самого себя и злоупотребления отклоняются.',
    shareMessage: 'Присоединяйся к LawBid! Мой код {{code}}: {{url}}',
  },
};

/** Fills {{code}} / {{url}}; unknown placeholders stay as written. */
export function renderReferralText(
  text: string,
  vars: { code: string; url: string },
): string {
  return text.replace(
    /\{\{\s*(code|url)\s*\}\}/g,
    (_, k: 'code' | 'url') => vars[k],
  );
}

/** Stored texts → full texts, falling back field by field. */
export function parseReferralTexts(raw: unknown): ReferralTextsByLang {
  const out = {} as ReferralTextsByLang;
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  for (const lang of REFERRAL_LANGS) {
    const l = src[lang];
    const o =
      l && typeof l === 'object' && !Array.isArray(l)
        ? (l as Record<string, unknown>)
        : {};
    const d = DEFAULT_REFERRAL_TEXTS[lang];
    const pick = (k: keyof ReferralTexts): string => {
      const v = o[k];
      return typeof v === 'string' && v.trim() !== '' ? v : d[k];
    };
    out[lang] = {
      title: pick('title'),
      summary: pick('summary'),
      terms: pick('terms'),
      shareMessage: pick('shareMessage'),
    };
  }
  return out;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralProgramSettings = {
  enabled: false,
  // $100 credit on the referrer attorney's next subscription invoice.
  attorneyReferrerReward: { type: 'balance_cents', value: 10_000 },
  // 20 % off the referee attorney's first month.
  attorneyRefereeReward: { type: 'percent_first_invoice', value: 20 },
  clientReferrerReward: { type: 'promotion_days', value: 1 },
  clientRefereeReward: { type: 'promotion_days', value: 1 },
  applyWindowDays: 14,
  maxInvitesPerReferrer: 0,
  texts: DEFAULT_REFERRAL_TEXTS,
};

/** Qualification rule: attorney referee → first succeeded (non-zero)
 * subscription payment; client referee → first published case.
 * `bid_accepted` (the client hired an attorney) is reported by bids for the
 * partner program (owner 2026-10-05) and ignored here. */
export type QualifyingEventKind =
  'subscription_payment' | 'case_published' | 'bid_accepted';

export const QUALIFYING_EVENT_FOR_ROLE: Record<
  'attorney' | 'client',
  QualifyingEventKind
> = { attorney: 'subscription_payment', client: 'case_published' };

export type ReferralRole = 'attorney' | 'client';

/** Reward types a recipient of that role can actually receive. */
export const ALLOWED_REWARDS: Record<
  'referrer' | 'referee',
  Record<ReferralRole, readonly RewardType[]>
> = {
  referrer: { attorney: ['balance_cents'], client: ['promotion_days'] },
  referee: {
    attorney: ['percent_first_invoice', 'balance_cents'],
    client: ['promotion_days'],
  },
};

const MAX_VALUE: Record<RewardType, number> = {
  balance_cents: 100_000,
  percent_first_invoice: 100,
  promotion_days: 30,
};

/** Owner 2026-10-05: small rewards («0.5 дня», «$0.05»). balance_cents
 * stays whole cents (so $0.05 = 5), percent stays whole, promotion days
 * take up to two decimals (0.01 day ≈ 15 minutes, 0.5 = 12 hours). */
export const REWARD_DECIMALS: Record<RewardType, number> = {
  balance_cents: 0,
  percent_first_invoice: 0,
  promotion_days: 2,
};

/** Whole days for the integer `*Days` / `value` API fields (older app
 * builds); the exact number travels in the `*Exact` / `amount` fields. */
export function wholeDays(n: number): number {
  return Math.floor(roundDays(n));
}

/** Reward as the API returns it: `value` stays an integer (whole days
 * for promotion_days), `amount` is the exact value. */
export function presentReward(r: ReferralReward): {
  type: RewardType;
  value: number;
  amount: number;
} {
  return {
    type: r.type,
    value: r.type === 'promotion_days' ? wholeDays(r.value) : r.value,
    amount: r.type === 'promotion_days' ? roundDays(r.value) : r.value,
  };
}

/** Settings as the API returns them (rewards through presentReward). */
export function presentReferralSettings(s: ReferralProgramSettings) {
  return {
    ...s,
    attorneyReferrerReward: presentReward(s.attorneyReferrerReward),
    attorneyRefereeReward: presentReward(s.attorneyRefereeReward),
    clientReferrerReward: presentReward(s.clientReferrerReward),
    clientRefereeReward: presentReward(s.clientRefereeReward),
  };
}

/** Request reward → stored reward: `amount` (exact) wins over `value`. */
export function rewardFromInput(r: {
  type: RewardType;
  value: number;
  amount?: number;
}): ReferralReward {
  return {
    type: r.type,
    value: typeof r.amount === 'number' ? r.amount : r.value,
  };
}

/** Rounds days to 0.01 (float sums of 0.1 + 0.2 never show 0.30000004). */
export function roundDays(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Returns a human error, or null when the reward fits its slot. */
export function validateReward(
  side: 'referrer' | 'referee',
  role: ReferralRole,
  reward: ReferralReward,
): string | null {
  if (!ALLOWED_REWARDS[side][role].includes(reward.type)) {
    return `${role} ${side} reward must be one of ${ALLOWED_REWARDS[side][role].join(', ')}`;
  }
  const decimals = REWARD_DECIMALS[reward.type];
  if (
    !Number.isFinite(reward.value) ||
    !hasDecimals(reward.value, decimals) ||
    reward.value < 0 ||
    reward.value > MAX_VALUE[reward.type]
  ) {
    return decimals === 0
      ? `${reward.type} value must be an integer 0–${MAX_VALUE[reward.type]}`
      : `${reward.type} value must be 0–${MAX_VALUE[reward.type]} with at most ${decimals} decimals`;
  }
  return null;
}

export function isReward(v: unknown): v is ReferralReward {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.type === 'string' &&
    (REWARD_TYPES as readonly string[]).includes(r.type) &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value)
  );
}

/** Stored JSON → settings, defaulting every missing/invalid field. */
export function parseReferralSettings(raw: unknown): ReferralProgramSettings {
  const d = DEFAULT_REFERRAL_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const reward = (key: keyof ReferralProgramSettings): ReferralReward => {
    const v = r[key];
    return isReward(v)
      ? { type: v.type, value: v.value }
      : (d[key] as ReferralReward);
  };
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    attorneyReferrerReward: reward('attorneyReferrerReward'),
    attorneyRefereeReward: reward('attorneyRefereeReward'),
    clientReferrerReward: reward('clientReferrerReward'),
    clientRefereeReward: reward('clientRefereeReward'),
    applyWindowDays:
      typeof r.applyWindowDays === 'number' &&
      Number.isInteger(r.applyWindowDays) &&
      r.applyWindowDays >= 0
        ? r.applyWindowDays
        : d.applyWindowDays,
    maxInvitesPerReferrer:
      typeof r.maxInvitesPerReferrer === 'number' &&
      Number.isInteger(r.maxInvitesPerReferrer) &&
      r.maxInvitesPerReferrer >= 0
        ? r.maxInvitesPerReferrer
        : d.maxInvitesPerReferrer,
    texts: parseReferralTexts(r.texts),
  };
}

export function rewardFor(
  settings: ReferralProgramSettings,
  side: 'referrer' | 'referee',
  role: ReferralRole,
): ReferralReward {
  if (side === 'referrer') {
    return role === 'attorney'
      ? settings.attorneyReferrerReward
      : settings.clientReferrerReward;
  }
  return role === 'attorney'
    ? settings.attorneyRefereeReward
    : settings.clientRefereeReward;
}

/** Stored JSON → snapshot (tolerates `{}` / foreign shapes). */
export function snapshotOf(v: unknown): ReferralRewardSnapshot | null {
  if (!isReward(v)) return null;
  const r = v as unknown as Record<string, unknown>;
  const uses =
    r.uses && typeof r.uses === 'object' && !Array.isArray(r.uses)
      ? Object.fromEntries(
          Object.entries(r.uses as Record<string, unknown>).filter(
            (e): e is [string, number] => typeof e[1] === 'number',
          ),
        )
      : undefined;
  return {
    type: v.type,
    value: v.value,
    ...(typeof r.issuedAt === 'string' ? { issuedAt: r.issuedAt } : {}),
    ...(uses ? { uses } : {}),
  };
}

/** Promotion days of a snapshot not yet spent. */
export function remainingDays(s: ReferralRewardSnapshot | null): number {
  if (!s || s.type !== 'promotion_days') return 0;
  const used = Object.values(s.uses ?? {}).reduce((a, b) => a + b, 0);
  return Math.max(0, roundDays(s.value - used));
}
