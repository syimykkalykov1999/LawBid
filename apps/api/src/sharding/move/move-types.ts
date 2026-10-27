/**
 * Shard-ready step 10: the vocabulary of the move-shard tool
 * (docs/architecture/SHARDING_READY.md §13).
 */
export const MOVE_STATES = [
  'preflight',
  'copy',
  'catchup',
  'freeze',
  'verify',
  'flip',
  'cleanup',
  'done',
] as const;
export type MoveState = (typeof MOVE_STATES)[number];

/**
 * running   a runner owns it (or it is queued behind another move)
 * waiting   flipped; the old rows are kept until `cleanup_after`
 * failed    stopped by an error; `resume` retries the step, `rollback` undoes
 * done      cleaned up
 * rolled_back  undone (before the flip: nothing changed; after: reversed)
 */
export type MoveStatus =
  'running' | 'waiting' | 'failed' | 'done' | 'rolled_back';

export const KEEP_OLD_ROWS_DAYS = 7;

export interface TableProgress {
  /** Last row copied (JSON text), the keyset cursor. */
  cursor: string | null;
  copied: number;
  done: boolean;
}

export interface MoveProgress {
  tables: Record<string, TableProgress>;
  /** Highest change-log id applied to the target. */
  logCursor: number;
  /** Late (cycle-breaking) columns filled. */
  lateDone: boolean;
  catchupRounds: number;
  verify?: VerifyResult;
  /** Human-readable last event, for the admin progress line. */
  note?: string;
}

export interface TableCount {
  table: string;
  rows: number;
}

export interface PreflightResult {
  ok: boolean;
  /** Blocking. */
  problems: string[];
  /** Informational. */
  warnings: string[];
  tables: TableCount[];
  totalRows: number;
  estimatedSeconds: number;
  fkDropped: { source: boolean; target: boolean };
  migrationsMatch: boolean;
}

export interface VerifyTable {
  table: string;
  sourceRows: number;
  targetRows: number;
  sourceSum: string;
  targetSum: string;
  ok: boolean;
}
export interface VerifyResult {
  ok: boolean;
  tables: VerifyTable[];
}

export interface MoveRecord {
  id: string;
  logicalShard: number;
  fromDb: string;
  toDb: string;
  state: MoveState;
  status: MoveStatus;
  progress: MoveProgress;
  plan: PreflightResult | null;
  error: string | null;
  requestedBy: string | null;
  heartbeatAt: Date | null;
  flippedAt: Date | null;
  leftoverDb: string | null;
  cleanupAfter: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function emptyProgress(): MoveProgress {
  return { tables: {}, logCursor: 0, lateDone: false, catchupRounds: 0 };
}

/** Thrown when the Redis lease is lost: the runner stops without touching
 * the move row, whoever owns the lease now continues. */
export class LeaseLostError extends Error {
  constructor() {
    super('shard move lease lost');
    this.name = 'LeaseLostError';
  }
}

export class MoveRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoveRefusedError';
  }
}
