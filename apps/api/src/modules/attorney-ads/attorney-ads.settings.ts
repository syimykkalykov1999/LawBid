/**
 * Owner 2026-10-28: attorney advertising compliance. One app_config row
 * (`attorney_ads.settings`, JSON) edited from GET/PUT
 * /admin/attorney-ads/settings. Everything is OFF (or "allowed") by
 * default, so nothing changes until the owner switches a state on.
 *
 * Rules follow the attorney's BAR ADMISSION: an attorney licensed in
 * several states gets the strictest mode, any archive switch, the longest
 * retention and the union of the disclaimers.
 */
export const ATTORNEY_ADS_SETTINGS_KEY = 'attorney_ads.settings';

export const AD_MODES = ['off', 'warn', 'block'] as const;
export type AdMode = (typeof AD_MODES)[number];

export const DEFAULT_RESULTS_DISCLAIMER =
  'Prior results do not guarantee a similar outcome.';
export const DEFAULT_AD_LABEL = 'Attorney Advertising';

export interface StateAdRules {
  /** off = nothing checked; warn = findings returned, text saved;
   * block = a high-risk finding refuses the text. */
  mode: AdMode;
  /** Rule ids switched off for this state (see ad-rules.ts). */
  disabledRules: string[];
  /** Keep every published version of the attorney's ads. */
  archive: boolean;
  /** How many years the archive keeps a copy. */
  retentionYears: number;
  /** The server adds the results / testimonial disclaimer. */
  disclaimers: boolean;
  resultsDisclaimer: string;
  /** Text of the «Attorney Advertising» label. */
  adLabel: string;
  /** Bid packs may be sold to attorneys licensed here (flag, default on). */
  bidPacksAllowed: boolean;
  /** Referral rewards may be paid to attorneys licensed here (flag only,
   * default on). */
  referralRewardsAllowed: boolean;
}

export interface AttorneyAdsSettings {
  defaults: StateAdRules;
  /** Per-state overrides by 2-letter region code (NY, NJ, ...). */
  states: Record<string, Partial<StateAdRules>>;
  /** Paid placement (plan «higher in search», active promotion) always
   * carries the «Attorney Advertising» label. */
  paidPlacementLabel: boolean;
}

export const DEFAULT_STATE_AD_RULES: StateAdRules = {
  mode: 'off',
  disabledRules: [],
  archive: false,
  retentionYears: 3,
  disclaimers: false,
  resultsDisclaimer: DEFAULT_RESULTS_DISCLAIMER,
  adLabel: DEFAULT_AD_LABEL,
  bidPacksAllowed: true,
  referralRewardsAllowed: true,
};

export const DEFAULT_ATTORNEY_ADS_SETTINGS: AttorneyAdsSettings = {
  defaults: DEFAULT_STATE_AD_RULES,
  states: {},
  paidPlacementLabel: false,
};

const bool = (v: unknown): boolean | undefined =>
  typeof v === 'boolean' ? v : undefined;
const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max
    ? v.trim()
    : undefined;

function parseRules(raw: unknown): Partial<StateAdRules> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<StateAdRules> = {};
  if (
    typeof r.mode === 'string' &&
    (AD_MODES as readonly string[]).includes(r.mode)
  )
    out.mode = r.mode as AdMode;
  if (
    Array.isArray(r.disabledRules) &&
    r.disabledRules.length <= 50 &&
    r.disabledRules.every((x) => typeof x === 'string' && x.length <= 40)
  )
    out.disabledRules = [...new Set(r.disabledRules as string[])];
  const archive = bool(r.archive);
  if (archive !== undefined) out.archive = archive;
  if (
    typeof r.retentionYears === 'number' &&
    Number.isInteger(r.retentionYears) &&
    r.retentionYears >= 1 &&
    r.retentionYears <= 10
  )
    out.retentionYears = r.retentionYears;
  const disclaimers = bool(r.disclaimers);
  if (disclaimers !== undefined) out.disclaimers = disclaimers;
  const rd = str(r.resultsDisclaimer, 300);
  if (rd) out.resultsDisclaimer = rd;
  const label = str(r.adLabel, 60);
  if (label) out.adLabel = label;
  const bp = bool(r.bidPacksAllowed);
  if (bp !== undefined) out.bidPacksAllowed = bp;
  const rr = bool(r.referralRewardsAllowed);
  if (rr !== undefined) out.referralRewardsAllowed = rr;
  return out;
}

/** Stored JSON → settings; anything unknown falls back to the defaults. */
export function parseAttorneyAdsSettings(raw: unknown): AttorneyAdsSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return structuredClone(DEFAULT_ATTORNEY_ADS_SETTINGS);
  }
  const r = raw as Record<string, unknown>;
  const defaults: StateAdRules = {
    ...DEFAULT_STATE_AD_RULES,
    ...parseRules(r.defaults),
  };
  const states: Record<string, Partial<StateAdRules>> = {};
  if (r.states && typeof r.states === 'object' && !Array.isArray(r.states)) {
    for (const [code, v] of Object.entries(r.states)) {
      if (/^[A-Z]{2}$/.test(code)) states[code] = parseRules(v);
    }
  }
  return {
    defaults,
    states,
    paidPlacementLabel:
      bool(r.paidPlacementLabel) ??
      DEFAULT_ATTORNEY_ADS_SETTINGS.paidPlacementLabel,
  };
}

/** The rules of one state (override on top of the defaults). */
export function rulesFor(s: AttorneyAdsSettings, code: string): StateAdRules {
  return { ...s.defaults, ...(s.states[code] ?? {}) };
}

const MODE_RANK: Record<AdMode, number> = { off: 0, warn: 1, block: 2 };

/** The rules for an attorney licensed in [codes]: the strictest wins. */
export function mergeRules(
  s: AttorneyAdsSettings,
  codes: readonly string[],
): StateAdRules {
  if (codes.length === 0) return { ...s.defaults };
  const all = codes.map((c) => rulesFor(s, c));
  const strict = all.reduce((a, b) =>
    MODE_RANK[b.mode] > MODE_RANK[a.mode] ? b : a,
  );
  return {
    mode: strict.mode,
    // A rule is skipped only when EVERY state switched it off.
    disabledRules: all
      .map((a) => a.disabledRules)
      .reduce((a, b) => a.filter((x) => b.includes(x))),
    archive: all.some((a) => a.archive),
    retentionYears: Math.max(...all.map((a) => a.retentionYears)),
    disclaimers: all.some((a) => a.disclaimers),
    resultsDisclaimer: strict.resultsDisclaimer,
    adLabel: strict.adLabel,
    bidPacksAllowed: all.every((a) => a.bidPacksAllowed),
    referralRewardsAllowed: all.every((a) => a.referralRewardsAllowed),
  };
}
