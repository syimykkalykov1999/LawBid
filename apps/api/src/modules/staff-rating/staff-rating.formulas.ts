/**
 * Staff package T5: the arithmetic of the staff rating, pure (no I/O) so it
 * is unit-tested on fixtures. Numbers come from StaffSettingsService (plan
 * D2), never from here. Research: docs/dev/STAFF_CONTROL_RESEARCH_2026-10-26.md
 * (§4 «Формула рейтинга», «Флаги», «Предлагаемые действия»).
 */

/** Handling-time buckets (seconds, upper edges); the last one is open. */
export const HANDLE_BUCKET_EDGES_SEC = [5, 15, 30, 60, 120, 300, 900] as const;
export const HANDLE_BUCKETS = HANDLE_BUCKET_EDGES_SEC.length + 1;
/** Upper bound reported for the open last bucket. */
const OPEN_BUCKET_SEC = 1800;

/** A handling time above this is a forgotten tab, not work: clamped. */
export const MAX_HANDLE_MS = 6 * 3600 * 1000;

/** Index of the bucket a handling time falls in. */
export function bucketOf(handleMs: number): number {
  const sec = Math.max(0, handleMs) / 1000;
  const i = HANDLE_BUCKET_EDGES_SEC.findIndex((edge) => sec < edge);
  return i === -1 ? HANDLE_BUCKETS - 1 : i;
}

/** Seconds at quantile [q] (0-1) estimated from the bucket counts (upper
 * edge of the bucket that crosses the quantile); 0 when there are none. */
export function percentileFromBuckets(buckets: number[], q: number): number {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const need = Math.ceil(total * q);
  let seen = 0;
  for (let i = 0; i < buckets.length; i++) {
    seen += buckets[i];
    if (seen >= need) return HANDLE_BUCKET_EDGES_SEC[i] ?? OPEN_BUCKET_SEC;
  }
  return OPEN_BUCKET_SEC;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Everything the rating needs about one person over the window. */
export interface WindowTotals {
  decided: number;
  reopened: number;
  /** complaint + appeal_won + overturned signals (negative, after close). */
  complaints: number;
  csatUp: number;
  csatDown: number;
  sampled: number;
  sampleDiff: number;
  goldenTotal: number;
  goldenFail: number;
  tooFast: number;
  lateSla: number;
  leaseLost: number;
}

export function emptyTotals(): WindowTotals {
  return {
    decided: 0,
    reopened: 0,
    complaints: 0,
    csatUp: 0,
    csatDown: 0,
    sampled: 0,
    sampleDiff: 0,
    goldenTotal: 0,
    goldenFail: 0,
    tooFast: 0,
    lateSla: 0,
    leaseLost: 0,
  };
}

export interface RatingConfig {
  /** Fewer decisions than this → «мало данных» (no rating, no action). */
  minDecisions: number;
  weights: {
    accuracy: number;
    clean: number;
    users: number;
    speed: number;
  };
  norm: number;
  yellowBelow: number;
  redBelow: number;
  greenTopPct: number;
  yellowComplaintsPerWeek: number;
  redOverturnedInRow: number;
}

export interface RatingResult {
  /** 0-100, null while lowData. */
  rating: number | null;
  lowData: boolean;
  /** Components, 0-100 each; null = no signal of that kind in the window. */
  accuracy: number | null;
  clean: number | null;
  users: number | null;
  speed: number | null;
}

const clampPct = (v: number): number => Math.max(0, Math.min(100, v));
const round = (v: number): number => Math.round(clampPct(v));

/**
 * Rating = 50% accuracy (re-checks and golden tasks) + 25% no reopenings /
 * complaints + 15% the users' verdict + 10% speed and discipline. A
 * component with no signal in the window drops out and its weight is shared
 * by the others (proportionally). Under [cfg.minDecisions] decisions the
 * result is `lowData` (no number): nobody is judged on a handful of cases.
 */
export function computeRating(
  t: WindowTotals,
  cfg: Pick<RatingConfig, 'minDecisions' | 'weights'>,
): RatingResult {
  const checks = t.sampled + t.goldenTotal;
  const accuracy =
    checks > 0
      ? round(100 * (1 - (t.sampleDiff + t.goldenFail) / checks))
      : null;
  const clean =
    t.decided > 0
      ? round(100 * (1 - (t.reopened + t.complaints) / t.decided))
      : null;
  const votes = t.csatUp + t.csatDown;
  const users = votes > 0 ? round((100 * t.csatUp) / votes) : null;
  const speed =
    t.decided > 0
      ? round(100 * (1 - (t.lateSla + t.leaseLost + t.tooFast) / t.decided))
      : null;
  const lowData = t.decided < cfg.minDecisions;
  const parts: Array<[number | null, number]> = [
    [accuracy, cfg.weights.accuracy],
    [clean, cfg.weights.clean],
    [users, cfg.weights.users],
    [speed, cfg.weights.speed],
  ];
  const present = parts.filter((p): p is [number, number] => p[0] !== null);
  let rating: number | null = null;
  if (!lowData && present.length > 0) {
    const sumW = present.reduce((a, [, w]) => a + w, 0);
    rating =
      sumW > 0
        ? round(present.reduce((a, [v, w]) => a + v * w, 0) / sumW)
        : round(present.reduce((a, [v]) => a + v, 0) / present.length);
  }
  return { rating, lowData, accuracy, clean, users, speed };
}

export type StaffStatus = 'low_data' | 'ok' | 'yellow' | 'red' | 'green';

/** Flag names stored in staff_rating_snapshots.flags. */
export const YELLOW_FLAGS = ['low_rating', 'complaints_week', 'golden_fail'];
export const RED_FLAGS = ['very_low', 'overturned_streak', 'rushing'];

export interface FlagInputs {
  rating: RatingResult;
  /** complaint-type signals in the last 7 days. */
  complaintsWeek: number;
  /** overturned signals in the last 7 days (stands in for «in a row»). */
  overturnedWeek: number;
  /** failed golden tasks in the window. */
  goldenFail: number;
  /** The anomaly detector saw hurry (too fast + always the same answer). */
  rushing: boolean;
}

/**
 * Yellow: rating below 75, or two complaints in a week, or a failed golden
 * task. Red: rating below 60, or three overturned decisions, or an obvious
 * sign of hurry. `low_data` wins over both colours for the STATUS (no
 * action on a handful of cases) but the flags are still written, so the
 * owner can see them. «Green» is assigned after ranking ({@link rankPct}).
 */
export function deriveStatus(
  f: FlagInputs,
  cfg: Pick<
    RatingConfig,
    | 'yellowBelow'
    | 'redBelow'
    | 'yellowComplaintsPerWeek'
    | 'redOverturnedInRow'
  >,
): { status: StaffStatus; flags: string[] } {
  const flags: string[] = [];
  const r = f.rating.rating;
  if (r !== null && r < cfg.redBelow) flags.push('very_low');
  else if (r !== null && r < cfg.yellowBelow) flags.push('low_rating');
  if (f.complaintsWeek >= cfg.yellowComplaintsPerWeek) {
    flags.push('complaints_week');
  }
  if (f.goldenFail > 0) flags.push('golden_fail');
  if (f.overturnedWeek >= cfg.redOverturnedInRow)
    flags.push('overturned_streak');
  if (f.rushing) flags.push('rushing');
  if (f.rating.lowData) return { status: 'low_data', flags };
  if (flags.some((x) => RED_FLAGS.includes(x))) return { status: 'red', flags };
  if (flags.length > 0) return { status: 'yellow', flags };
  return { status: 'ok', flags };
}

/** Top-percent position of [rating] among [peers] (1 = the very best);
 * null when there are no peers. Ties share the better place. */
export function rankPct(peers: number[], rating: number): number | null {
  if (peers.length === 0) return null;
  const better = peers.filter((p) => p > rating).length;
  return Math.ceil((100 * (better + 1)) / peers.length);
}

/** «Лучший»: top greenTopPct % of the workspace and at or above the norm. */
export function isGreen(
  status: StaffStatus,
  rating: number | null,
  pct: number | null,
  cfg: Pick<RatingConfig, 'greenTopPct' | 'norm'>,
): boolean {
  return (
    status === 'ok' &&
    rating !== null &&
    rating >= cfg.norm &&
    pct !== null &&
    pct <= cfg.greenTopPct
  );
}

export type SuggestionKind =
  'warn' | 'more_review' | 'pull' | 'replace' | 'reward';

/** A new warning is not written again within this many days (one episode
 * of low quality is ONE warning, not one per night). */
export const WARN_COOLDOWN_DAYS = 7;

export interface SuggestionContext {
  status: StaffStatus;
  /** Warnings (not dismissed) in the last `staff.warnings.window_days`. */
  warningsInWindow: number;
  /** Days since the newest warning; null = none. */
  daysSinceLastWarning: number | null;
  /** Kinds that already have an OPEN suggestion for this person. */
  openKinds: ReadonlySet<string>;
  /** `staff.warnings.for_replace`. */
  warningsForReplace: number;
}

/**
 * What the system SUGGESTS (a human applies it; nothing here is an action):
 *  - yellow/red → a warning (once per episode) and more re-checks;
 *  - red → take off the queue;
 *  - warnings in the window reach the limit → replace;
 *  - green → a reward.
 * `low_data` and `ok` people get nothing.
 */
export function planSuggestions(c: SuggestionContext): SuggestionKind[] {
  const out: SuggestionKind[] = [];
  const want = (k: SuggestionKind) => {
    if (!c.openKinds.has(k)) out.push(k);
  };
  if (c.status === 'green') want('reward');
  if (c.status === 'yellow' || c.status === 'red') {
    const cooled =
      c.daysSinceLastWarning === null ||
      c.daysSinceLastWarning >= WARN_COOLDOWN_DAYS;
    const warning = cooled && !c.openKinds.has('warn');
    if (warning) out.push('warn');
    want('more_review');
    if (c.status === 'red') want('pull');
    if (
      c.warningsInWindow + (warning ? 1 : 0) >= c.warningsForReplace &&
      c.warningsForReplace > 0
    ) {
      want('replace');
    }
  }
  return out;
}
