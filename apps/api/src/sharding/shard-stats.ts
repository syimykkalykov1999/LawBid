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

  /** Counts since the last `drain()`, without resetting them. */
  peek(): ShardStatsSnapshot {
    return {
      total: this.total,
      byModel: Object.fromEntries(this.byModel),
      weakTotal: this.weakTotal,
      weakByModel: Object.fromEntries(this.weakByModel),
    };
  }

  /** Returns the counts and starts over; null when nothing was counted. */
  drain(): ShardStatsSnapshot | null {
    if (this.total === 0 && this.weakTotal === 0) return null;
    const out = this.peek();
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
    const s = shardStats.drain();
    if (!s) return;
    const top = (m: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(m)
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_MODELS),
      );
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
