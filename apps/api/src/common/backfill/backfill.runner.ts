import type {
  BackfillDb,
  BackfillDefinition,
  BackfillGuard,
  BackfillStore,
} from './backfill.types';

export const DEFAULT_BATCH = 1000;
export const DEFAULT_ROWS_PER_SEC = 2000;

export interface RunOptions {
  batchSize?: number;
  maxRowsPerSec?: number;
  restart?: boolean;
  /** How long to wait while paused or while the database is busy. */
  idleMs?: number;
  /** Give up waiting while paused after this long (state stays; run again). */
  maxPausedMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
}

export type RunResult =
  | { outcome: 'done'; processed: number }
  | {
      outcome: 'aborted' | 'paused-timeout' | 'failed';
      processed: number;
      detail?: string;
    }
  | { outcome: 'refused'; detail: string };

/**
 * Walks `def.table` in primary-key order, `batchSize` keys at a time. Per
 * batch: ask the guard (replica lag, DB CPU, connections, autovacuum) if the
 * database may work; run the definition's idempotent update on the key range;
 * save the cursor; sleep so the average stays under `maxRowsPerSec`. An admin
 * pausing / aborting is noticed at the next batch (status is returned by the
 * progress write). Crash-safe: the cursor moves only after a batch is
 * applied, and a replayed batch changes nothing.
 */
export async function runBackfill(
  def: BackfillDefinition,
  db: BackfillDb,
  store: BackfillStore,
  guard: BackfillGuard,
  opts: RunOptions = {},
): Promise<RunResult> {
  const sleep =
    opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const log = opts.log ?? (() => undefined);
  const idleMs = opts.idleMs ?? 5000;
  const maxPausedMs = opts.maxPausedMs ?? 6 * 3600_000;
  const batchSize = opts.batchSize ?? def.batchSize ?? DEFAULT_BATCH;
  const maxRowsPerSec =
    opts.maxRowsPerSec ?? def.maxRowsPerSec ?? DEFAULT_ROWS_PER_SEC;

  const begun = await store.begin(def, {
    batchSize,
    maxRowsPerSec,
    restart: opts.restart ?? false,
  });
  if ('refused' in begun) return { outcome: 'refused', detail: begun.refused };
  let cursor = begun.row.cursor;
  let processed = begun.row.processed;
  let waitedMs = 0;

  try {
    for (;;) {
      // Pause / abort set by an admin (also refreshes the heartbeat).
      const status = await store.heartbeat(def.name, null);
      if (status === 'aborted') return { outcome: 'aborted', processed };
      if (status === 'paused') {
        if (waitedMs >= maxPausedMs)
          return { outcome: 'paused-timeout', processed };
        await sleep(idleMs);
        waitedMs += idleMs;
        continue;
      }
      if (status !== 'running')
        return { outcome: 'aborted', processed, detail: `status ${status}` };

      const rest = await guard.check(def.table);
      if (rest) {
        await store.heartbeat(def.name, `waiting: ${rest}`);
        log(`resting: ${rest}`);
        await sleep(idleMs);
        continue;
      }
      waitedMs = 0;

      const range = await store.nextRange(def, cursor, batchSize);
      if (!range) {
        await store.finish(def.name);
        return { outcome: 'done', processed };
      }
      const started = now();
      const changed = await def.apply(db, range);
      const after = await store.progress(def.name, range.hi, changed);
      cursor = range.hi;
      processed += changed;
      log(`${def.name}: ${processed} rows, cursor ${cursor}`);
      if (after === 'aborted') return { outcome: 'aborted', processed };

      // Throttle on the keys scanned, not only rows changed, so a run over
      // already-fixed rows is not hammering the index either.
      const minMs = (batchSize / maxRowsPerSec) * 1000;
      const spent = now() - started;
      if (spent < minMs) await sleep(minMs - spent);
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await store.fail(def.name, detail);
    return { outcome: 'failed', processed, detail };
  }
}
