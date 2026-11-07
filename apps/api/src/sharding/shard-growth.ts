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
  /** Always false: a move is started by the owner, never by a timer. */
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
