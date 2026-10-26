import { Logger } from '@nestjs/common';
import { LOGICAL_SHARDS, hashShard, shardOf } from './shard-id';

/**
 * Shard-ready step 3 (docs/architecture/SHARDING_READY.md §5): the in-process
 * copy of `shard_map` (logical shard 0..255 -> physical database key).
 *
 *  - Lookups are SYNCHRONOUS (PrismaService is a Proxy: a property access
 *    cannot wait). The map is loaded at start-up and then refreshed in the
 *    background: when the TTL expires (default 30 s, `SHARD_MAP_TTL_MS`)
 *    and when another process publishes an invalidation on Redis
 *    (`ShardMapSync`). Until a load succeeds, and for any shard without a
 *    row, the answer is `primary`.
 *  - Version fence: every row carries `version`; a load whose highest
 *    version is older than the one already applied (a lagging replica, a
 *    slow query overtaken by a newer one) is ignored.
 *  - A failed load keeps the previous map and retries after the TTL. A
 *    missing table (migration not applied yet) is the same as an
 *    all-`primary` map.
 */
export const PRIMARY_DB = 'primary';
export const SHARD_MAP_CHANNEL = 'lawbid:shard-map:invalidate';
export const DEFAULT_SHARD_MAP_TTL_MS = 30_000;

export interface ShardMapRow {
  logical_shard: number;
  physical_db: string;
  version: number;
}
export type ShardMapLoader = () => Promise<ShardMapRow[]>;

export interface ShardRouterOptions {
  ttlMs?: number;
  now?: () => number;
}

export class ShardRouter {
  private readonly log = new Logger('ShardRouter');
  private readonly ttlMs: number;
  private readonly now: () => number;
  private map: string[] = new Array<string>(LOGICAL_SHARDS).fill(PRIMARY_DB);
  private version = 0;
  private loadedAt = 0;
  private started = false;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly loader: ShardMapLoader | null,
    opts: ShardRouterOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_SHARD_MAP_TTL_MS;
    this.now = opts.now ?? Date.now;
  }

  /** First load; from here on lookups also refresh in the background. */
  async start(): Promise<void> {
    this.started = true;
    await this.refresh();
  }

  /** Physical database key of a logical shard (`primary` when unknown). */
  physicalFor(shard: number): string {
    this.maybeRefresh();
    return this.map[shard] ?? PRIMARY_DB;
  }

  forCase(caseId: string): string {
    return this.physicalFor(shardOf(caseId));
  }

  forUser(userId: string): string {
    return this.physicalFor(hashShard(userId));
  }

  /** Distinct physical keys the map currently points at. */
  physicalKeys(): string[] {
    return [...new Set(this.map)];
  }

  get mapVersion(): number {
    return this.version;
  }

  /** Re-reads the table now (Redis invalidation, tests, admin tools). */
  refresh(): Promise<void> {
    if (!this.loader) return Promise.resolve();
    if (this.inflight) return this.inflight;
    this.inflight = this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private maybeRefresh(): void {
    if (!this.started || !this.loader || this.inflight) return;
    if (this.now() - this.loadedAt < this.ttlMs) return;
    void this.refresh();
  }

  private async load(): Promise<void> {
    // Stamp first: a failing database is retried after the TTL, not on
    // every query.
    this.loadedAt = this.now();
    try {
      const rows = await this.loader!();
      this.apply(rows);
    } catch (e) {
      this.log.warn(
        `shard_map not loaded, keeping the previous map: ${String(e)}`,
      );
    }
  }

  /** Applies a loaded map unless it is older than the one in use. */
  apply(rows: ShardMapRow[]): boolean {
    const top = rows.reduce((v, r) => Math.max(v, r.version), 0);
    if (top < this.version) return false;
    const next = new Array<string>(LOGICAL_SHARDS).fill(PRIMARY_DB);
    for (const r of rows) {
      if (
        Number.isInteger(r.logical_shard) &&
        r.logical_shard >= 0 &&
        r.logical_shard < LOGICAL_SHARDS &&
        r.physical_db
      ) {
        next[r.logical_shard] = r.physical_db;
      }
    }
    this.map = next;
    this.version = top;
    return true;
  }
}
