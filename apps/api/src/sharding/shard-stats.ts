import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';

/**
 * Shard-ready step 4: counts the queries on sharded-family models that ran
 * WITHOUT a shard context (they fell back to the primary database). Today
 * that is harmless; each one is a call site the later steps must give a
 * context before a second physical database exists.
 *
 * Module-level singleton (PrismaService is built outside DI); the Nest
 * provider below writes ONE log line a minute per process, only when
 * something was counted:
 *   {metric: "shard_no_context", total, byModel: {Case: 12, ...}}
 */
export interface ShardStatsSnapshot {
  /** Sharded-family queries with no shard context at all. */
  total: number;
  byModel: Record<string, number>;
  /** Sharded-family queries under the weak `auth` context (the request's
   * user, a guess for anything but that user's own data). */
  weakTotal: number;
  weakByModel: Record<string, number>;
  /** `Model.op` -> global writes made inside a non-primary transaction. */
  globalWrites: Record<string, number>;
  /** Model -> unkeyed queries answered by scatter-gather. */
  scatters: Record<string, number>;
}

class ShardStats {
  private byModel = new Map<string, number>();
  private weakByModel = new Map<string, number>();
  private total = 0;
  private weakTotal = 0;

  noContext(model: string): void {
    this.total += 1;
    this.byModel.set(model, (this.byModel.get(model) ?? 0) + 1);
  }

  weakContext(model: string): void {
    this.weakTotal += 1;
    this.weakByModel.set(model, (this.weakByModel.get(model) ?? 0) + 1);
  }

  private globalWrites = new Map<string, number>();
  private scatters = new Map<string, number>();

  /** A query that named no shard ran on every database and was merged. */
  scatter(model: string): void {
    this.scatters.set(model, (this.scatters.get(model) ?? 0) + 1);
  }

  /** A global-family write made inside a transaction that runs on a
   * non-primary database (tx-global-facade.ts): applied "global first". */
  globalWriteInShardTx(model: string, op: string): void {
    const k = `${model}.${op}`;
    this.globalWrites.set(k, (this.globalWrites.get(k) ?? 0) + 1);
  }

  private idV8 = 0;
  private idV4 = 0;
  private idV4ByModel = new Map<string, number>();

  /**
   * DB-ops S5-12: one insert of a sharded-family row whose primary key is a
   * time-ordered sharded id (`sharded = true`, UUIDv8) or a random UUIDv4
   * (the caller passed `randomUUID()`, `SHARD_IDS=off`, or the database
   * default `gen_random_uuid()` filled it). Counted here, in the process,
   * because a database trigger per insert would cost far more than the
   * number is worth.
   */
  idInsert(model: string, sharded: boolean): void {
    if (sharded) {
      this.idV8 += 1;
      return;
    }
    this.idV4 += 1;
    this.idV4ByModel.set(model, (this.idV4ByModel.get(model) ?? 0) + 1);
  }

  /** Id counts since the last call; null when nothing was inserted. */
  drainIds(): {
    v8: number;
    v4: number;
    share: number;
    v4ByModel: Record<string, number>;
  } | null {
    if (this.idV8 === 0 && this.idV4 === 0) return null;
    const out = {
      v8: this.idV8,
      v4: this.idV4,
      share: this.idV4 / (this.idV8 + this.idV4),
      v4ByModel: Object.fromEntries(this.idV4ByModel),
    };
    this.idV8 = 0;
    this.idV4 = 0;
    this.idV4ByModel = new Map();
    return out;
  }

  /** Counts since the last `drain()`, without resetting them. */
  peek(): ShardStatsSnapshot {
    return {
      total: this.total,
      byModel: Object.fromEntries(this.byModel),
      weakTotal: this.weakTotal,
      weakByModel: Object.fromEntries(this.weakByModel),
      globalWrites: Object.fromEntries(this.globalWrites),
      scatters: Object.fromEntries(this.scatters),
    };
  }

  /** Returns the counts and starts over; null when nothing was counted. */
  drain(): ShardStatsSnapshot | null {
    if (
      this.total === 0 &&
      this.weakTotal === 0 &&
      this.globalWrites.size === 0 &&
      this.scatters.size === 0
    ) {
      return null;
    }
    const out = this.peek();
    this.globalWrites = new Map();
    this.scatters = new Map();
    this.byModel = new Map();
    this.weakByModel = new Map();
    this.total = 0;
    this.weakTotal = 0;
    return out;
  }
}

export const shardStats = new ShardStats();

const FLUSH_MS = 60_000;
/** Top models in the log line (a line per model would cost more). */
const TOP_MODELS = 15;

@Injectable()
export class ShardStatsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ShardStatsService.name);
  private timer?: NodeJS.Timeout;

  onModuleInit(): void {
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  flush(): void {
    // DB-ops S5-12: share of random v4 primary keys among new sharded-family
    // rows (a hot table whose key is half random loses index locality).
    const ids = shardStats.drainIds();
    if (ids && ids.v4 > 0) {
      this.logger.log({
        metric: 'shard_id_v4_share',
        v8: ids.v8,
        v4: ids.v4,
        share: Math.round(ids.share * 10_000) / 10_000,
        v4ByModel: Object.fromEntries(
          Object.entries(ids.v4ByModel)
            .sort((a, b) => b[1] - a[1])
            .slice(0, TOP_MODELS),
        ),
        msg: 'new sharded-family rows with a random (v4) primary key',
      });
    }
    const s = shardStats.drain();
    if (!s) return;
    const top = (m: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(m)
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_MODELS),
      );
    if (Object.keys(s.globalWrites).length > 0) {
      this.logger.log({
        metric: 'shard_tx_global_write',
        byModelOp: top(s.globalWrites),
        msg: 'global-family writes inside a transaction on a non-primary database (global first, not atomic)',
      });
    }
    if (Object.keys(s.scatters).length > 0) {
      this.logger.log({
        metric: 'shard_scatter',
        byModel: top(s.scatters),
        msg: 'queries that named no shard and ran on every database',
      });
    }
    if (s.total === 0 && s.weakTotal === 0) return;
    this.logger.log({
      metric: 'shard_no_context',
      total: s.total,
      byModel: top(s.byModel),
      weakTotal: s.weakTotal,
      weakByModel: top(s.weakByModel),
      msg: 'sharded-family queries without (or with only a weak) shard context',
    });
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
