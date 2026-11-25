import { Logger } from '@nestjs/common';

/**
 * Pack C (round 2 #3, 25.11): work that must run only once a transaction
 * has COMMITTED — the realtime `case:update` used to leave on a 300 ms
 * timer, so a rolled-back transaction still sent it, a slow commit let the
 * app re-read the old row, and a `withTxRetry` retry sent it twice.
 *
 * The pattern is Django's `transaction.on_commit()` / Rails'
 * `after_commit` (idea only, own code): callbacks registered against a
 * transaction are kept with it and run after its COMMIT; a rollback (or a
 * 40001 attempt that `withTxRetry` repeats) drops them, so each committed
 * transaction runs them exactly once.
 *
 * Every interactive `prisma.$transaction(fn)` goes through the
 * PrismaService proxy, which opens the scope (prisma.service.ts).
 */
const pending = new WeakMap<object, Array<() => void>>();
const log = new Logger('AfterCommit');

/** Opens the after-commit list of [tx] (called by the PrismaService proxy). */
export function openCommitScope(tx: object): Array<() => void> {
  const list: Array<() => void> = [];
  pending.set(tx, list);
  return list;
}

/** Runs the callbacks of a committed transaction, each on its own. */
export function flushCommitScope(list: Array<() => void>): void {
  for (const fn of list.splice(0)) {
    try {
      fn();
    } catch (e) {
      log.warn(`after-commit callback failed: ${(e as Error).message}`);
    }
  }
}

/** Drops the callbacks of a rolled-back transaction. */
export function dropCommitScope(list: Array<() => void>): void {
  list.length = 0;
}

/**
 * Runs [fn] after [tx] commits; without a transaction, right away.
 * Returns false when [tx] is not a transaction the PrismaService opened
 * (a hand-made client in a test): the caller picks its own fallback.
 */
export function afterCommit(
  tx: object | null | undefined,
  fn: () => void,
): boolean {
  if (!tx) {
    fn();
    return true;
  }
  const list = pending.get(tx);
  if (!list) return false;
  list.push(fn);
  return true;
}
