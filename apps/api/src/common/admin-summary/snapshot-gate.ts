import type { PrismaService } from '../../prisma/prisma.service';

const HOUR_MS = 3_600_000;
/** The quiet hour (UTC) when the daily recount happens by itself. */
export const SNAPSHOT_HOUR_UTC = 4;
/** Whatever the clock says, never keep a daily value longer than this. */
const MAX_AGE_MS = 26 * HOUR_MS;

/**
 * Owner 2026-10-25: heavy admin counts run once a day. Due when nothing is
 * stored, when the value is older than 26 h, or in the 04:xx UTC hour when it
 * is at least 20 h old (so the recount settles into the quiet hour).
 */
export function dailyDue(
  computedAt: string | undefined | null,
  now: Date = new Date(),
): boolean {
  if (!computedAt) return true;
  const age = now.getTime() - Date.parse(computedAt);
  if (!(age >= 0)) return false;
  if (age >= MAX_AGE_MS) return true;
  return now.getUTCHours() === SNAPSHOT_HOUR_UTC && age >= 20 * HOUR_MS;
}

/**
 * Runs the snapshot's queries in one transaction capped at 30 s, so a heavy
 * count can never hold the database longer (SET LOCAL ends with the
 * transaction). `fn` gets the transaction client.
 */
export function withSnapshotTimeout<T>(
  prisma: PrismaService,
  fn: (tx: PrismaService) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
      return fn(tx as unknown as PrismaService);
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

/** What {@link readDailySnapshot} needs of AdminSummaryService. */
interface SnapshotStore {
  peek<T>(key: string): Promise<{ data: T; computedAt: string } | null>;
  refresh<T>(
    key: string,
    compute: () => Promise<T>,
    waitForOther?: boolean,
  ): Promise<{ data: T; computedAt: string }>;
}

/**
 * Round 4 admin check (25.11, С11): the owner rule «admin numbers come from
 * the nightly snapshot, never a live heavy query on each open» for a page
 * whose service the worker does not load. The stored copy is returned at any
 * age; when the daily recount is due ({@link dailyDue}: the 04 UTC hour, or
 * older than 26 h) ONE process recounts it in the background (the
 * AdminSummaryService lock) while this request still answers from the copy.
 * Only when nothing was ever stored does the first request count it once,
 * and concurrent openers wait for that one count. Without the store (unit
 * tests, a tool) it simply counts.
 */
export async function readDailySnapshot<T>(
  store: SnapshotStore | undefined,
  key: string,
  compute: () => Promise<T>,
  now: Date = new Date(),
): Promise<T> {
  if (!store) return compute();
  const hit = await store.peek<T>(key);
  if (hit) {
    if (dailyDue(hit.computedAt, now)) {
      void store.refresh(key, compute).catch(() => undefined);
    }
    return hit.data;
  }
  return (await store.refresh(key, compute, true)).data;
}
