import type { Prisma } from '@prisma/client';

/**
 * Batched backfills (docs/architecture/ONLINE_DDL.md). Same shape as GitLab's
 * batched background migrations (docs.gitlab.com/development/database/
 * batched_background_migrations): named job, key-range batches, resumable
 * cursor, each batch small and idempotent, pause on database health signals.
 */
export type BackfillKeyType = 'uuid' | 'bigint';

export type BackfillStatus =
  'running' | 'paused' | 'aborted' | 'done' | 'failed';

/** Keys in (lo, hi]; `lo` is null on the first batch. */
export interface KeyRange {
  lo: string | null;
  hi: string;
}

export interface BackfillDefinition {
  /** Unique, stable, kebab-case: `2026-11-orders-total-cents`. */
  name: string;
  description: string;
  /** Table walked in key order (lower-case identifier). */
  table: string;
  /** Primary key column walked (default `id`). */
  keyColumn?: string;
  keyType: BackfillKeyType;
  batchSize?: number;
  maxRowsPerSec?: number;
  /**
   * Fix one key range and return how many rows it changed. MUST be
   * idempotent: guard the UPDATE with "not yet done" (`WHERE new_col IS NULL`)
   * so a replayed batch changes nothing. Keep one batch well under a second.
   */
  apply(db: BackfillDb, range: KeyRange): Promise<number>;
}

export type BackfillDb = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | '$executeRaw' | '$queryRawUnsafe' | '$executeRawUnsafe'
>;

export interface BackfillRow {
  name: string;
  status: BackfillStatus;
  table_name: string;
  cursor: string | null;
  processed: number;
  total_estimate: number | null;
  batch_size: number;
  max_rows_per_sec: number;
  pause_reason: string | null;
  last_error: string | null;
  started_at: Date;
  updated_at: Date;
  heartbeat_at: Date;
  finished_at: Date | null;
}

/** What the runner needs from storage (a real table, or a fake in tests). */
export interface BackfillStore {
  /** Create or continue the row. `null` = refused (see `reason`). */
  begin(
    def: BackfillDefinition,
    opts: { batchSize: number; maxRowsPerSec: number; restart: boolean },
  ): Promise<{ row: BackfillRow } | { refused: string }>;
  get(name: string): Promise<BackfillRow | null>;
  /** Next batch upper bound after `cursor`, or null when no keys are left. */
  nextRange(
    def: BackfillDefinition,
    cursor: string | null,
    size: number,
  ): Promise<KeyRange | null>;
  /** Save progress; returns the status as an admin may have changed it. */
  progress(name: string, cursor: string, rows: number): Promise<BackfillStatus>;
  heartbeat(name: string, pauseReason: string | null): Promise<BackfillStatus>;
  finish(name: string): Promise<void>;
  fail(name: string, error: string): Promise<void>;
  setStatus(
    name: string,
    to: 'paused' | 'running' | 'aborted',
  ): Promise<BackfillRow | null>;
  list(): Promise<BackfillRow[]>;
  estimateTotal(def: BackfillDefinition): Promise<number | null>;
}

/** Returns why the database should rest now, or null when all is calm. */
export interface BackfillGuard {
  check(table: string): Promise<string | null>;
}
