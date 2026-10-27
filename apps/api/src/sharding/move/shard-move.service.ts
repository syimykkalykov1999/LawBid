import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ShardMapSync } from '../shard-map-sync';
import { LOGICAL_SHARDS } from '../shard-id';
import { PRIMARY_DB } from '../shard-router';
import { remainingCrossFamilyForeignKeys } from './cross-family-fks';
import { MemoryMoveLease, RedisMoveLease } from './move-lease';
import { MoveDbPool } from './move-db';
import { buildMoveTables } from './move-plan';
import { q } from './move-sql';
import { MoveRecord, MoveRefusedError, PreflightResult } from './move-types';
import { PgMoveOps } from './pg-move-ops';
import { PrismaMoveStore } from './shard-move.store';
import { ShardMoveRunner, MoveLease, RunnerOptions } from './shard-move.runner';

export interface Readiness {
  toDb: string;
  configured: boolean;
  reachable: boolean;
  migrationsApplied: boolean;
  missingMigrations: number;
  crossFamilyFksLeft: number;
  ok: boolean;
  problems: string[];
}

export interface SplitPlan {
  fromDb: string;
  toDb: string;
  shards: number[];
  rows: number;
  estimatedSeconds: number;
  readiness: Readiness;
}

const PER_SHARD_OVERHEAD_SECONDS = 20;
const ROWS_PER_SECOND = 4000;

/**
 * Shard-ready step 10: the entry point of the move tool for the CLI, the
 * admin API and the cron tick (docs/architecture/SHARDING_READY.md §13).
 */
@Injectable()
export class ShardMoveService {
  private readonly log = new Logger('ShardMoveService');
  private driving = false;
  readonly store: PrismaMoveStore;
  private readonly lease: MoveLease;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: ShardMapSync,
    @Optional() @Inject(REDIS_CLIENT) redis?: Redis,
    @Optional() private readonly pool: MoveDbPool = new MoveDbPool(),
    @Optional() private readonly options: Partial<RunnerOptions> = {},
  ) {
    this.store = new PrismaMoveStore(prisma);
    this.lease = redis ? new RedisMoveLease(redis) : new MemoryMoveLease();
  }

  runner(): ShardMoveRunner {
    return new ShardMoveRunner({
      store: this.store,
      lease: this.lease,
      sync: this.sync,
      opsFor: (from, to) =>
        new PgMoveOps(this.pool.get(from), this.pool.get(to)),
      options: this.options,
    });
  }

  /** Configured physical databases other than the primary one. */
  extraDatabases(): string[] {
    return this.pool.keys().filter((k) => k !== PRIMARY_DB);
  }

  /** Is the new database configured, reachable and migrated? */
  async readiness(toDb: string): Promise<Readiness> {
    const problems: string[] = [];
    const r: Readiness = {
      toDb,
      configured: this.pool.has(toDb),
      reachable: false,
      migrationsApplied: false,
      missingMigrations: 0,
      crossFamilyFksLeft: 0,
      ok: false,
      problems,
    };
    if (toDb === PRIMARY_DB)
      problems.push('the target cannot be the primary database');
    if (!r.configured) {
      problems.push(
        `DATABASE_URL_SHARDS has no "${toDb}" (set it and restart the API)`,
      );
      return r;
    }
    try {
      const target = this.pool.get(toDb);
      await target.query('SELECT 1');
      r.reachable = true;
      const names = async (db: ReturnType<MoveDbPool['get']>) =>
        (
          await db.query<{ migration_name: string }>(
            `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
          )
        ).map((x) => x.migration_name);
      const [have, want] = await Promise.all([
        names(target),
        names(this.pool.get(PRIMARY_DB)),
      ]);
      const haveSet = new Set(have);
      r.missingMigrations = want.filter((m) => !haveSet.has(m)).length;
      r.migrationsApplied = r.missingMigrations === 0;
      if (!r.migrationsApplied) {
        problems.push(
          `${toDb} lacks ${r.missingMigrations} migration(s): run prisma migrate deploy on it`,
        );
      }
      r.crossFamilyFksLeft = await remainingCrossFamilyForeignKeys(
        target,
      ).catch(() => -1);
    } catch (e) {
      problems.push(
        `${toDb} is not reachable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    r.ok = problems.length === 0;
    return r;
  }

  /** Preview of "split the database": which shards, how many rows, how long. */
  async splitPlan(
    toDb: string,
    fromDb: string = PRIMARY_DB,
  ): Promise<SplitPlan> {
    const readiness = await this.readiness(toDb);
    const map = await this.prisma.global().shardMap.findMany({
      where: { physical_db: fromDb, state: 'active' },
      orderBy: { logical_shard: 'asc' },
      select: { logical_shard: true },
    });
    const all = map.map((m) => m.logical_shard);
    // Upper half goes: shards are hash-uniform, so rows split about evenly.
    const shards = all.slice(Math.ceil(all.length / 2));
    let rows = 0;
    if (shards.length && this.pool.has(fromDb)) {
      const src = this.pool.get(fromDb);
      for (const t of buildMoveTables()) {
        const [c] = await src.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ${q(t.table)} WHERE shard_id = ANY($1::int[])`,
          [shards],
        );
        rows += c.n;
      }
    }
    return {
      fromDb,
      toDb,
      shards,
      rows,
      estimatedSeconds: Math.ceil(
        rows / ROWS_PER_SECOND + shards.length * PER_SHARD_OVERHEAD_SECONDS,
      ),
      readiness,
    };
  }

  /** Dry run of one shard: the full preflight, nothing written. */
  dryRun(
    shard: number,
    toDb: string,
  ): Promise<PreflightResult & { fromDb: string }> {
    this.assertShard(shard);
    return this.runner().plan(shard, toDb);
  }

  private assertShard(shard: number): void {
    if (!Number.isInteger(shard) || shard < 0 || shard >= LOGICAL_SHARDS) {
      throw new MoveRefusedError(
        `logical shard must be 0..${LOGICAL_SHARDS - 1}`,
      );
    }
  }

  /** Queues the moves; `driveQueue` (background) runs them one by one. */
  async startSplit(
    toDb: string,
    shards: number[],
    requestedBy: string | null,
  ): Promise<MoveRecord[]> {
    const readiness = await this.readiness(toDb);
    if (!readiness.ok)
      throw new MoveRefusedError(readiness.problems.join('; '));
    const runner = this.runner();
    const out: MoveRecord[] = [];
    for (const s of [...new Set(shards)].sort((a, b) => a - b)) {
      this.assertShard(s);
      out.push(await runner.enqueue(s, toDb, requestedBy));
    }
    void this.driveQueue().catch((e) =>
      this.log.error(`queue stopped: ${String(e)}`),
    );
    return out;
  }

  /**
   * Runs queued moves (status `running`) oldest first until one fails or
   * the queue is empty. Safe to call from anywhere: the Redis lease keeps a
   * second caller (another process, the cron tick) out.
   */
  async driveQueue(): Promise<number> {
    if (this.driving) return 0;
    this.driving = true;
    let n = 0;
    try {
      for (;;) {
        const next = (await this.store.queued())[0];
        if (!next) break;
        let done;
        try {
          done = await this.runner().run(next.id);
        } catch (e) {
          if (e instanceof MoveRefusedError) break; // another runner has the lease
          throw e;
        }
        n += 1;
        if (done.status === 'failed') break;
      }
    } finally {
      this.driving = false;
    }
    return n;
  }

  /** Retry a failed move from its saved step. */
  async resume(id: string): Promise<MoveRecord> {
    return this.runner().run(id);
  }

  rollback(id: string): Promise<MoveRecord> {
    return this.runner().rollback(id);
  }

  /** Cron: continue stalled/queued moves, then delete old rows that are due. */
  async tick(): Promise<{ moves: number; cleaned: number }> {
    if (this.extraDatabases().length === 0) return { moves: 0, cleaned: 0 };
    const moves = await this.driveQueue();
    let cleaned = 0;
    for (const m of await this.store.dueForCleanup(new Date())) {
      try {
        await this.runner().cleanup(m.id);
        cleaned += 1;
      } catch (e) {
        this.log.warn(`cleanup of move ${m.id} skipped: ${String(e)}`);
      }
    }
    return { moves, cleaned };
  }

  /** Everything the admin screen shows. */
  async overview() {
    const map = await this.prisma.global().shardMap.groupBy({
      by: ['physical_db', 'state'],
      _count: { _all: true },
    });
    return {
      databases: ['primary', ...this.extraDatabases()],
      distribution: map.map((m) => ({
        database: m.physical_db,
        state: m.state,
        shards: m._count._all,
      })),
      moves: await this.store.recent(),
      leaseHeld:
        this.lease instanceof RedisMoveLease ? await this.lease.held() : false,
    };
  }

  async getMove(id: string): Promise<MoveRecord | null> {
    return this.store.get(id);
  }

  async close(): Promise<void> {
    await this.pool.close();
  }
}
