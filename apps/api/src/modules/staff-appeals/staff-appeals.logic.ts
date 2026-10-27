/**
 * Staff package T6: the pure rules of complaints against a head and the
 * retaliation guard (no I/O, unit-tested). The numbers come from the staff
 * settings (`staff.retaliation.*`, `staff.head.*`, `staff.reveal_per_day`);
 * nothing here is hard-coded policy except the shapes.
 */

const DAY_MS = 86_400_000;

export const APPEAL_KINDS = [
  'unfair_pull',
  'pressure',
  'insult',
  'rules',
  'other',
] as const;
export type AppealKind = (typeof APPEAL_KINDS)[number];

export const APPEAL_DECISIONS = [
  'fire_head',
  'fire_worker',
  'nothing',
] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

/** Actions of a head that the retaliation guard looks at (RetaliationPort). */
export const REMOVAL_ACTIONS = ['pull', 'replace', 'offboard'] as const;

/** staff_actions.kind values that mean «the person was taken off the work». */
export const REMOVAL_KINDS: readonly string[] = [...REMOVAL_ACTIONS];

/** Signal reason codes written to the owner inbox (staff_actions.kind = signal). */
export const SIGNAL_KIND = 'signal';
export const SIGNAL_SOURCE = 'system';
export const SIGNAL = {
  turnover: 'team_turnover_high',
  topRated: 'top_rated_removed',
  noWarning: 'removal_without_warning',
  multiAppeals: 'head_multi_appeals',
  holdExpired: 'retaliation_decide',
  appealUnanswered: 'appeal_unanswered',
} as const;
export type SignalCode = (typeof SIGNAL)[keyof typeof SIGNAL];

/** End of the protection window of an appeal: filed + [days]. */
export function windowUntil(filedAt: Date, days: number): Date {
  return new Date(filedAt.getTime() + days * DAY_MS);
}

/** True while [now] is inside the protection window of an appeal. */
export function insideWindow(filedAt: Date, now: Date, days: number): boolean {
  return now.getTime() < windowUntil(filedAt, days).getTime();
}

/** The start of the look-back period [days] before [now]. */
export function since(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** The end of a hold that starts [now]. */
export function holdUntil(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** What the owner reads instead of the name of an anonymous author. */
export function anonymousLabel(alias: number): string {
  return `автор обжалования №${alias}`;
}

export interface AuthorView {
  /** null while the author is anonymous (and not revealed). */
  adminId: string | null;
  label: string;
  anonymous: boolean;
}

/**
 * The author as the owner's list shows them: an anonymous author is only
 * «автор обжалования №N» (no id, no name); the name of a non-anonymous one
 * is shown. Revealing is a separate, logged, capped action (never this).
 */
export function maskAuthor(
  appeal: { anonymous: boolean; author_alias: number; author_id: string },
  nameOf: (adminId: string) => string | undefined,
): AuthorView {
  if (appeal.anonymous) {
    return {
      adminId: null,
      label: anonymousLabel(appeal.author_alias),
      anonymous: true,
    };
  }
  return {
    adminId: appeal.author_id,
    label: nameOf(appeal.author_id) ?? anonymousLabel(appeal.author_alias),
    anonymous: false,
  };
}

/** The author's own status line: received → seen → decided (no verdict). */
export function authorStatus(
  status: string,
): 'received' | 'in_review' | 'decided' {
  if (status === 'resolved') return 'decided';
  if (status === 'seen') return 'in_review';
  return 'received';
}

/** True while the owner may still reveal [cap] more names today. */
export function revealAllowed(usedToday: number, cap: number): boolean {
  return usedToday < cap;
}

/** UTC start of the day of [now] (the reveal cap resets at 00:00 UTC). */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Guard: more than [pct] % of a team removed in the look-back period, only
 * for teams of at least [minPeople]. [removed] already counts the current
 * removal.
 */
export function turnoverExceeded(args: {
  removed: number;
  team: number;
  pct: number;
  minPeople: number;
}): boolean {
  if (args.team < args.minPeople || args.team <= 0) return false;
  return (args.removed * 100) / args.team > args.pct;
}

/**
 * Guard: the removed worker was rated [topRating]+ or stands in the best
 * [topPct] % of their workspace (rank_pct: 1 = the very best). A person
 * without a rating (low data / no snapshot) is never «top».
 */
export function isTopRated(args: {
  rating: number | null | undefined;
  rankPct: number | null | undefined;
  topRating: number;
  topPct: number;
}): boolean {
  if (args.rating === null || args.rating === undefined) return false;
  if (args.rating >= args.topRating) return true;
  return (
    args.rankPct !== null &&
    args.rankPct !== undefined &&
    args.rankPct <= args.topPct
  );
}

/** Guard: [authors] distinct people complained about the same head. */
export function multiAppeals(authors: number, min: number): boolean {
  return authors >= min;
}

/** Weighted head score 0-100 over the parts that exist (weights re-spread). */
export function headScore(
  parts: Array<{ value: number | null; weight: number }>,
): number | null {
  const have = parts.filter((p) => p.value !== null && p.weight > 0);
  const total = have.reduce((s, p) => s + p.weight, 0);
  if (total === 0) return null;
  const sum = have.reduce((s, p) => s + (p.value as number) * p.weight, 0);
  return Math.round(sum / total);
}

export interface PageCursor {
  at: Date;
  id: string;
}

export function encodeCursor(c: PageCursor): string {
  return Buffer.from(`${c.at.toISOString()}|${c.id}`).toString('base64url');
}

export function decodeCursor(raw: string | undefined): PageCursor | null {
  if (!raw) return null;
  try {
    const [iso, id] = Buffer.from(raw, 'base64url').toString().split('|');
    const at = new Date(iso);
    if (!id || Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/** A person's display name in the owner's panel. */
export function displayName(u: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return full || u.email || 'без имени';
}
