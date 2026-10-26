// Owner 2026-10-25: pure rules of a signing request's life — expiry,
// reminders and the audit of who opened it. Clio Sign / Dropbox Sign style:
// an expiry date, reminders to the side that has not signed, an audit trail
// that shows views and the expiry.

export interface ViewEntry {
  userId: string;
  role: 'client' | 'attorney';
  at: string;
  ip: string | null;
}

/** The log keeps this many latest views (a signed protocol needs few). */
export const VIEW_LOG_MAX = 50;
/** The same person reopening within this time is one view. */
export const VIEW_DEDUPE_MS = 10 * 60 * 1000;

/** Reads a stored log defensively (it is JSON in the database). */
export function parseViewLog(raw: unknown): ViewEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ViewEntry =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as ViewEntry).userId === 'string' &&
      typeof (e as ViewEntry).at === 'string',
  );
}

/**
 * The log after [entry] — or null when nothing should be written (the same
 * person viewed within the dedupe window). [first] tells that this person
 * had never viewed it before (the journal records first views only).
 */
export function withView(
  log: ViewEntry[],
  entry: ViewEntry,
): { log: ViewEntry[]; first: boolean } | null {
  const mine = log.filter((e) => e.userId === entry.userId);
  const last = mine[mine.length - 1];
  if (
    last &&
    new Date(entry.at).getTime() - new Date(last.at).getTime() < VIEW_DEDUPE_MS
  ) {
    return null;
  }
  return {
    log: [...log, entry].slice(-VIEW_LOG_MAX),
    first: mine.length === 0,
  };
}

export function isExpired(expiresAt: Date | null, now: Date): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

/** A reminder is due every [everyDays] days since the request or the last
 * reminder, up to [max]; 0 days = reminders off. */
export function signReminderDue(args: {
  now: Date;
  createdAt: Date;
  lastRemindedAt: Date | null;
  remindersSent: number;
  everyDays: number;
  max: number;
}): boolean {
  if (args.everyDays <= 0 || args.remindersSent >= args.max) return false;
  const since = args.lastRemindedAt ?? args.createdAt;
  return args.now.getTime() - since.getTime() >= args.everyDays * 86_400_000;
}
