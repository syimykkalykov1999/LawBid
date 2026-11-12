/**
 * When to prepare a second physical database ("a shard") — the threshold
 * watcher's pure part. It reads nothing and moves nothing: it turns three
 * cheap numbers (database size, estimated rows of the sharded-family tables,
 * what is already configured) into a status and a ready split plan, which the
 * «Здоровье системы» card shows. Moving the shards stays a button for the
 * owner (admin-shards, step-up): there is no target database to move to until
 * one is provisioned, and a move of live user data is not something to start
 * without a person (docs/architecture/SHARDING_READY.md §13).
 */

/** Same figures the move tool uses for its own estimate (shard-move.service). */
export const SPLIT_ROWS_PER_SECOND = 4000;
export const SPLIT_SECONDS_PER_SHARD = 20;
/** Yellow from this share of a threshold: a database takes time to provision. */
export const PREPARE_FROM = 0.8;

export interface ShardGrowthInput {
  /** pg_database_size of the primary, bytes. */
  dbBytes: number;
  /** Estimated rows (pg_class.reltuples) of the sharded-family tables. */
  rows: number;
  thresholdGb: number;
  thresholdRows: number;
  /** Keys of DATABASE_URL_SHARDS, the physical databases besides primary. */
  targets: readonly string[];
  /** Active logical shards that live on the primary, and all active ones. */
  shardsOnPrimary: number;
}

export type ShardGrowthStatus = 'green' | 'yellow' | 'red';

export interface ShardGrowth {
  status: ShardGrowthStatus;
  /** The larger of size / threshold and rows / threshold (1 = at threshold). */
  ratio: number;
  sizeGb: number;
  thresholdGb: number;
  rows: number;
  thresholdRows: number;
  targets: string[];
  targetReady: boolean;
  /** Ready plan "move the upper half of the primary's shards", or null. */
  plan: { shards: number; rows: number; estimatedSeconds: number } | null;
  /** Moves start only by the owner's button or, with db.shards_mode = auto,
   * by autoSplitTarget (the first split of an empty server). */
  autoMove: false;
}

const GB = 1024 ** 3;

export function assessShardGrowth(i: ShardGrowthInput): ShardGrowth {
  const sizeGb = i.dbBytes / GB;
  const ratio = Math.max(
    i.thresholdGb > 0 ? sizeGb / i.thresholdGb : 0,
    i.thresholdRows > 0 ? i.rows / i.thresholdRows : 0,
  );
  const status: ShardGrowthStatus =
    ratio >= 1 ? 'red' : ratio >= PREPARE_FROM ? 'yellow' : 'green';
  // The move tool sends the upper half of the shards that sit on the source.
  const moving = Math.floor(i.shardsOnPrimary / 2);
  const planRows =
    i.shardsOnPrimary > 0
      ? Math.round((i.rows * moving) / i.shardsOnPrimary)
      : 0;
  return {
    status,
    ratio: Math.floor(ratio * 100) / 100,
    sizeGb: Math.round(sizeGb * 10) / 10,
    thresholdGb: i.thresholdGb,
    rows: Math.round(i.rows),
    thresholdRows: i.thresholdRows,
    targets: [...i.targets],
    targetReady: i.targets.length > 0,
    plan:
      moving > 0
        ? {
            shards: moving,
            rows: planRows,
            estimatedSeconds: Math.ceil(
              planRows / SPLIT_ROWS_PER_SECOND +
                moving * SPLIT_SECONDS_PER_SHARD,
            ),
          }
        : null,
    autoMove: false,
  };
}

/**
 * Owner 2026-11-11 (db.shards_mode = auto): which server an automatic split
 * goes to, or null and why not. Only the FIRST split of a server is
 * automatic — it is empty, so its half of the shards is the plan the
 * «Здоровье системы» card shows; every later move stays a button. Pure.
 */
export function autoSplitTarget(i: {
  mode: string;
  growth: Pick<ShardGrowth, 'status' | 'plan'>;
  /** Extra databases and how many active shards each one holds. */
  targets: readonly { key: string; shards: number }[];
  /** A move is queued or running. */
  busy: boolean;
  inWindow: boolean;
}): { target: string | null; why: string } {
  if (i.mode !== 'auto') return { target: null, why: 'mode' };
  if (i.growth.status !== 'red')
    return { target: null, why: 'below_threshold' };
  if (!i.growth.plan || i.growth.plan.shards === 0)
    return { target: null, why: 'nothing_to_move' };
  if (i.busy) return { target: null, why: 'busy' };
  if (!i.inWindow) return { target: null, why: 'hours' };
  const empty = i.targets.find((t) => t.shards === 0);
  if (!empty) return { target: null, why: 'no_empty_server' };
  return { target: empty.key, why: 'split' };
}

/**
 * Owner 2026-11-11 (third and fourth servers): how full each database server
 * is against the split threshold, and whether the next server is needed.
 */
export interface ServerFill {
  key: string;
  /** The larger of size / threshold and rows / threshold (1 = at threshold). */
  ratio: number;
  /** Active logical shards on this server. */
  shards: number;
}

/**
 * The next server is needed when some server is at PREPARE_FROM of the
 * threshold and no extra server is still empty (an empty one takes the next
 * split first). Pure.
 */
export function serversFull(fill: readonly ServerFill[]): boolean {
  const near = fill.some((f) => f.ratio >= PREPARE_FROM);
  const emptyExtra = fill.some((f) => f.key !== 'primary' && f.shards === 0);
  return near && !emptyExtra;
}

/** The fullest server over the threshold that can give half its shards. */
export function splitSource(fill: readonly ServerFill[]): string | null {
  const over = fill
    .filter((f) => f.ratio >= 1 && f.shards >= 2)
    .sort((a, b) => b.ratio - a.ratio);
  return over[0]?.key ?? null;
}
