import type { AppSettingsService } from '../../common/app-settings/app-settings.service';

/**
 * DB scale batch B: how fast the nightly retention removes rows. Every number
 * is an admin setting (it was 5000 rows per DELETE, a 200 ms pause and a
 * hard 1M rows per table per run).
 */
export interface RetentionPace {
  /** Most rows per table per run; 0 = no cap. */
  maxRows: number;
  /** Rows per DELETE (at least 1). */
  batch: number;
  /** Pause between two DELETEs, ms. */
  pauseMs: number;
}

export async function retentionPace(
  settings: AppSettingsService,
): Promise<RetentionPace> {
  const [maxRows, batch, pauseMs] = await Promise.all([
    settings.number('storage.retention_max_rows_per_table'),
    settings.number('storage.retention_batch_rows'),
    settings.number('storage.retention_pause_ms'),
  ]);
  return {
    maxRows: Math.max(0, Math.floor(maxRows)),
    batch: Math.max(1, Math.floor(batch)),
    pauseMs: Math.max(0, Math.floor(pauseMs)),
  };
}

/**
 * Runs [step] (one DELETE of at most `limit` rows, returns how many went)
 * until a batch comes back short or the run cap is reached. With a cap the
 * last DELETE asks only for what is left, so a run never goes past it.
 */
export async function deleteInBatches(
  step: (limit: number) => Promise<number>,
  pace: RetentionPace,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const left = pace.maxRows > 0 ? pace.maxRows - deleted : pace.batch;
    if (left <= 0) break;
    const limit = Math.min(pace.batch, left);
    const n = await step(limit);
    deleted += n;
    if (n < limit) break;
    // A short pause so a big backlog never hogs the database.
    if (pace.pauseMs > 0) {
      await new Promise((r) => setTimeout(r, pace.pauseMs));
    }
  }
  return deleted;
}
