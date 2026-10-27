import { Logger } from '@nestjs/common';
import type { MoveTable } from './move-plan';
import {
  KEEP_OLD_ROWS_DAYS,
  LeaseLostError,
  MoveProgress,
  MoveRecord,
  MoveRefusedError,
  PreflightResult,
  VerifyResult,
  emptyProgress,
} from './move-types';

/**
 * Shard-ready step 10: the state machine of "move one logical shard from
 * one physical database to another" (docs/architecture/SHARDING_READY.md
 * §13). Pure orchestration: all database work is behind `MoveOps`, the move
 * row behind `MoveStore`, the mutual exclusion behind `MoveLease`, so every
 * state is unit-tested with fakes and the real SQL is covered by the
 * two-database e2e.
 *
 *   preflight -> copy -> catchup -> freeze -> verify -> flip -> (7 days) -> cleanup -> done
 *
 * Properties:
 *  - RESUMABLE: `state` and `progress` (per-table keyset cursors, change-log
 *    cursor) are saved after every batch; `resume` re-enters the saved step.
 *  - IDEMPOTENT: copy and replay are upserts by primary key; every step may
 *    run twice.
 *  - LEASE: one runner at a time (Redis lease with a token, renewed on every
 *    batch); a runner that loses it stops without touching the row.
 *  - REVERSIBLE: before the flip the target copy is deleted and nothing else
 *    changed; after the flip the target keeps a change log, so `rollback`
 *    replays it into the old copy (reverse sync) and flips back, until the
 *    old rows are cleaned up after KEEP_OLD_ROWS_DAYS.
 */
export interface MoveOps {
  tables(): MoveTable[];
  preflight(shard: number): Promise<PreflightResult>;
  /** Cross-family FKs dropped on both sides; source tracking + guard on. */
  prepare(shard: number, moveId: string): Promise<void>;
  copyBatch(
    shard: number,
    table: MoveTable,
    cursor: string | null,
    batch: number,
  ): Promise<{ rows: number; cursor: string | null; done: boolean }>;
  /** Second pass for cycle-breaking columns (whole shard). */
  fillLate(shard: number): Promise<void>;
  backlog(shard: number, after: number): Promise<number>;
  applyLog(
    shard: number,
    after: number,
    limit: number,
  ): Promise<{ lastId: number; entries: number }>;
  freeze(shard: number, ms: number): Promise<void>;
  drain(shard: number, timeoutMs: number): Promise<boolean>;
  verify(shard: number): Promise<VerifyResult>;
  /** Target: tracking + guard triggers, for reverse sync after the flip. */
  armTarget(shard: number, moveId: string): Promise<void>;
  /** Source: permanent write fence (frozen until infinity). */
  fenceSource(shard: number): Promise<void>;
  /** Source: lifts a freeze / fence (writes allowed again). */
  unfreeze(shard: number): Promise<void>;
  /** Deletes the track row + change log of the shard; drops the triggers
   * when no shard is tracked any more. */
  release(shard: number, side: 'source' | 'target'): Promise<void>;
  /** Deletes up to one pass of rows of the shard; returns rows removed. */
  purge(
    shard: number,
    side: 'source' | 'target',
    batch: number,
  ): Promise<number>;
}

export interface MapEntry {
  physicalDb: string;
  state: string;
  version: number;
}

export interface MoveStore {
  create(input: {
    logicalShard: number;
    fromDb: string;
    toDb: string;
    requestedBy: string | null;
  }): Promise<MoveRecord>;
  get(id: string): Promise<MoveRecord | null>;
  update(id: string, patch: Partial<MoveRecord>): Promise<MoveRecord>;
  /** A move of this shard that is not finished (running/waiting/failed). */
  activeFor(shard: number): Promise<MoveRecord | null>;
  mapOf(shard: number): Promise<MapEntry>;
  setMapState(shard: number, state: string): Promise<void>;
  /** Points the shard at `toDb`, version = highest + 1; returns it. */
  flipMap(shard: number, toDb: string): Promise<number>;
}

export interface LeaseHandle {
  /** Renews the lease; throws LeaseLostError when it is gone. */
  assertHeld(): Promise<void>;
  release(): Promise<void>;
}
export interface MoveLease {
  acquire(): Promise<LeaseHandle | null>;
}

export interface MapSync {
  invalidate(): Promise<void>;
}

export interface RunnerOptions {
  batchSize: number;
  /** Backlog (change-log rows) below which the freeze may start. */
  catchupThreshold: number;
  maxCatchupRounds: number;
  freezeMs: number;
  drainTimeoutMs: number;
  keepDays: number;
  now: () => Date;
}

export const DEFAULT_RUNNER_OPTIONS: RunnerOptions = {
  batchSize: 2000,
  catchupThreshold: 200,
  maxCatchupRounds: 30,
  freezeMs: 60_000,
  drainTimeoutMs: 30_000,
  keepDays: KEEP_OLD_ROWS_DAYS,
  now: () => new Date(),
};

export class MoveVerifyError extends Error {
  constructor(readonly result: VerifyResult) {
    super(
      `verification failed: ${result.tables
        .filter((t) => !t.ok)
        .map((t) => `${t.table} ${t.sourceRows}/${t.targetRows}`)
        .join(', ')}`,
    );
    this.name = 'MoveVerifyError';
  }
}

export interface RunnerDeps {
  store: MoveStore;
  lease: MoveLease;
  sync: MapSync;
  opsFor: (fromDb: string, toDb: string) => MoveOps;
  options?: Partial<RunnerOptions>;
}

export class ShardMoveRunner {
  private readonly log = new Logger('ShardMove');
  private readonly o: RunnerOptions;

  constructor(private readonly d: RunnerDeps) {
    this.o = { ...DEFAULT_RUNNER_OPTIONS, ...d.options };
  }

  /** Dry run: the preflight and the plan, nothing is written anywhere. */
  async plan(
    shard: number,
    toDb: string,
  ): Promise<PreflightResult & { fromDb: string }> {
    const map = await this.d.store.mapOf(shard);
    const result = await this.d.opsFor(map.physicalDb, toDb).preflight(shard);
    const problems = [...result.problems, ...this.mapProblems(map, toDb)];
    return {
      ...result,
      ok: problems.length === 0,
      problems,
      fromDb: map.physicalDb,
    };
  }

  /** Creates the move row (state preflight) for the shard's current database. */
  async enqueue(
    shard: number,
    toDb: string,
    requestedBy: string | null,
  ): Promise<MoveRecord> {
    const existing = await this.d.store.activeFor(shard);
    if (existing) {
      throw new MoveRefusedError(
        `logical shard ${shard} already has an unfinished move (${existing.id}, ${existing.status})`,
      );
    }
    const map = await this.d.store.mapOf(shard);
    const problems = this.mapProblems(map, toDb);
    if (problems.length) throw new MoveRefusedError(problems.join('; '));
    return this.d.store.create({
      logicalShard: shard,
      fromDb: map.physicalDb,
      toDb,
      requestedBy,
    });
  }

  private mapProblems(map: MapEntry, toDb: string): string[] {
    const out: string[] = [];
    if (map.physicalDb === toDb) out.push(`shard is already on ${toDb}`);
    if (map.state !== 'active') {
      out.push(`shard_map state is "${map.state}", not "active"`);
    }
    return out;
  }

  /**
   * Runs (or resumes) a move from its saved step until it is flipped,
   * failed, or rolled back. Returns the final record. Holds the lease.
   */
  async run(id: string): Promise<MoveRecord> {
    const lease = await this.d.lease.acquire();
    if (!lease) throw new MoveRefusedError('another shard move is running');
    try {
      return await this.drive(id, lease);
    } finally {
      await lease.release().catch(() => undefined);
    }
  }

  private async drive(id: string, lease: LeaseHandle): Promise<MoveRecord> {
    let rec = await this.must(id);
    if (rec.status === 'failed') {
      // A retry restarts the step that failed; freeze/verify go back to the
      // catch-up, because the writers were let in again.
      const back =
        rec.state === 'freeze' || rec.state === 'verify'
          ? 'catchup'
          : rec.state;
      rec = await this.d.store.update(id, {
        status: 'running',
        state: back,
        error: null,
      });
    }
    if (rec.status !== 'running') return rec;
    const ops = this.d.opsFor(rec.fromDb, rec.toDb);
    try {
      for (;;) {
        await lease.assertHeld();
        switch (rec.state) {
          case 'preflight':
            rec = await this.stepPreflight(rec, ops);
            break;
          case 'copy':
            rec = await this.stepCopy(rec, ops, lease);
            break;
          case 'catchup':
            rec = await this.stepCatchup(rec, ops, lease);
            break;
          case 'freeze':
            rec = await this.stepFreeze(rec, ops, lease);
            break;
          case 'verify':
            rec = await this.stepVerify(rec, ops, lease);
            break;
          case 'flip':
            rec = await this.stepFlip(rec, ops, lease);
            break;
          default:
            return rec;
        }
        if (rec.status !== 'running') return rec;
      }
    } catch (e) {
      if (e instanceof LeaseLostError) throw e;
      const message = e instanceof Error ? e.message : String(e);
      this.log.error(
        `shard ${rec.logicalShard} move ${rec.id} failed in ${rec.state}: ${message}`,
      );
      // Writers must never stay locked out by a failed attempt.
      if (rec.state === 'freeze' || rec.state === 'verify') {
        await ops.unfreeze(rec.logicalShard).catch(() => undefined);
      }
      return this.d.store.update(id, {
        status: 'failed',
        error: message.slice(0, 500),
      });
    }
  }

  private async must(id: string): Promise<MoveRecord> {
    const rec = await this.d.store.get(id);
    if (!rec) throw new MoveRefusedError(`move ${id} not found`);
    return rec;
  }

  private async save(
    rec: MoveRecord,
    progress: MoveProgress,
    patch: Partial<MoveRecord> = {},
  ): Promise<MoveRecord> {
    return this.d.store.update(rec.id, {
      progress,
      heartbeatAt: this.o.now(),
      ...patch,
    });
  }

  /* --------------------------------------------------------- steps --- */

  private async stepPreflight(
    rec: MoveRecord,
    ops: MoveOps,
  ): Promise<MoveRecord> {
    const result = await ops.preflight(rec.logicalShard);
    const map = await this.d.store.mapOf(rec.logicalShard);
    const problems = [
      ...result.problems,
      ...(map.physicalDb === rec.fromDb
        ? []
        : [`shard moved meanwhile: now on ${map.physicalDb}`]),
    ];
    const plan = { ...result, ok: problems.length === 0, problems };
    if (problems.length) {
      return this.d.store.update(rec.id, {
        plan,
        status: 'failed',
        error: problems.join('; ').slice(0, 500),
      });
    }
    return this.save(rec, rec.progress ?? emptyProgress(), {
      plan,
      state: 'copy',
    });
  }

  private async stepCopy(
    rec: MoveRecord,
    ops: MoveOps,
    lease: LeaseHandle,
  ): Promise<MoveRecord> {
    const shard = rec.logicalShard;
    await ops.prepare(shard, rec.id);
    await this.d.store.setMapState(shard, 'migrating');
    const progress: MoveProgress = { ...emptyProgress(), ...rec.progress };
    progress.tables = { ...progress.tables };
    for (const t of ops.tables()) {
      let p = progress.tables[t.table] ?? {
        cursor: null,
        copied: 0,
        done: false,
      };
      while (!p.done) {
        await lease.assertHeld();
        const r = await ops.copyBatch(shard, t, p.cursor, this.o.batchSize);
        p = { cursor: r.cursor, copied: p.copied + r.rows, done: r.done };
        progress.tables[t.table] = p;
        progress.note = `copy ${t.table}: ${p.copied} rows`;
        rec = await this.save(rec, progress);
      }
    }
    if (!progress.lateDone) {
      await ops.fillLate(shard);
      progress.lateDone = true;
    }
    return this.save(rec, progress, { state: 'catchup' });
  }

  /** Applies the change log until fewer than `until` entries are waiting. */
  private async drainLog(
    rec: MoveRecord,
    ops: MoveOps,
    lease: LeaseHandle,
    progress: MoveProgress,
    until: number,
    maxRounds: number,
    keepFrozen: boolean,
  ): Promise<{ rec: MoveRecord; backlog: number }> {
    const shard = rec.logicalShard;
    let backlog = await ops.backlog(shard, progress.logCursor);
    for (let round = 0; backlog > until && round < maxRounds; round++) {
      await lease.assertHeld();
      if (keepFrozen) await ops.freeze(shard, this.o.freezeMs);
      const r = await ops.applyLog(shard, progress.logCursor, this.o.batchSize);
      progress.logCursor = r.lastId;
      progress.catchupRounds += 1;
      progress.note = `catch-up: ${r.entries} changes applied`;
      rec = await this.save(rec, progress);
      backlog = await ops.backlog(shard, progress.logCursor);
    }
    return { rec, backlog };
  }

  private async stepCatchup(
    rec: MoveRecord,
    ops: MoveOps,
    lease: LeaseHandle,
  ): Promise<MoveRecord> {
    const progress: MoveProgress = { ...emptyProgress(), ...rec.progress };
    // The log is applied while writers are still running; the freeze starts
    // when the rest is small (a few seconds of work), or after
    // `maxCatchupRounds` even if writers keep it large.
    const r = await this.drainLog(
      rec,
      ops,
      lease,
      progress,
      this.o.catchupThreshold,
      this.o.maxCatchupRounds,
      false,
    );
    return this.save(r.rec, progress, { state: 'freeze' });
  }

  private async stepFreeze(
    rec: MoveRecord,
    ops: MoveOps,
    lease: LeaseHandle,
  ): Promise<MoveRecord> {
    const shard = rec.logicalShard;
    const progress: MoveProgress = { ...emptyProgress(), ...rec.progress };
    await ops.freeze(shard, this.o.freezeMs);
    if (!(await ops.drain(shard, this.o.drainTimeoutMs))) {
      throw new Error(
        'writers did not finish within the drain timeout; shard unfrozen, retry later',
      );
    }
    // Frozen and drained: the log is final. Apply all of it.
    const r = await this.drainLog(
      rec,
      ops,
      lease,
      progress,
      0,
      1_000_000,
      true,
    );
    return this.save(r.rec, progress, { state: 'verify' });
  }

  private async stepVerify(
    rec: MoveRecord,
    ops: MoveOps,
    lease: LeaseHandle,
  ): Promise<MoveRecord> {
    const shard = rec.logicalShard;
    const progress: MoveProgress = { ...emptyProgress(), ...rec.progress };
    await ops.freeze(shard, this.o.freezeMs);
    await lease.assertHeld();
    const result = await ops.verify(shard);
    progress.verify = result;
    rec = await this.save(rec, progress);
    if (!result.ok) throw new MoveVerifyError(result);
    return this.save(rec, progress, { state: 'flip' });
  }

  private async stepFlip(
    rec: MoveRecord,
    ops: MoveOps,
    lease: LeaseHandle,
  ): Promise<MoveRecord> {
    const shard = rec.logicalShard;
    const map = await this.d.store.mapOf(shard);
    if (map.physicalDb !== rec.toDb) {
      await ops.freeze(shard, this.o.freezeMs);
      await ops.armTarget(shard, rec.id);
      await ops.fenceSource(shard);
      try {
        await lease.assertHeld();
        await this.d.store.flipMap(shard, rec.toDb);
      } catch (e) {
        // The map did not change: let writers back into the old copy.
        const now = await this.d.store.mapOf(shard).catch(() => null);
        if (!now || now.physicalDb !== rec.toDb) {
          await ops.unfreeze(shard).catch(() => undefined);
          throw e;
        }
      }
    }
    await this.d.sync
      .invalidate()
      .catch((e) =>
        this.log.warn(
          `shard_map invalidate failed (TTL refresh will follow): ${String(e)}`,
        ),
      );
    const now = this.o.now();
    const cleanupAfter = new Date(now.getTime() + this.o.keepDays * 86_400_000);
    return this.d.store.update(rec.id, {
      state: 'cleanup',
      status: 'waiting',
      flippedAt: now,
      leftoverDb: rec.fromDb,
      cleanupAfter,
      error: null,
      heartbeatAt: now,
    });
  }

  /* ------------------------------------------------------ rollback --- */

  /**
   * Undoes a move. Before the flip: the target copy is deleted, tracking
   * removed, the shard stays where it was. After the flip (and before the
   * cleanup): reverse sync, see class comment.
   */
  async rollback(id: string): Promise<MoveRecord> {
    const lease = await this.d.lease.acquire();
    if (!lease) throw new MoveRefusedError('another shard move is running');
    try {
      return await this.rollbackLocked(id, lease);
    } finally {
      await lease.release().catch(() => undefined);
    }
  }

  private async rollbackLocked(
    id: string,
    lease: LeaseHandle,
  ): Promise<MoveRecord> {
    const rec = await this.must(id);
    if (rec.status === 'done' || rec.status === 'rolled_back') {
      throw new MoveRefusedError(`move is already ${rec.status}`);
    }
    const shard = rec.logicalShard;
    const map = await this.d.store.mapOf(shard);
    const ops = this.d.opsFor(rec.fromDb, rec.toDb);
    if (map.physicalDb === rec.fromDb) {
      // Before the flip. Nothing is routed to the target yet.
      await ops.unfreeze(shard);
      await ops.release(shard, 'source');
      while ((await ops.purge(shard, 'target', this.o.batchSize)) > 0) {
        await lease.assertHeld();
      }
      await ops.release(shard, 'target');
      await this.d.store.setMapState(shard, 'active');
      return this.d.store.update(id, {
        status: 'rolled_back',
        error: null,
        leftoverDb: null,
        cleanupAfter: null,
        heartbeatAt: this.o.now(),
      });
    }
    // After the flip: reverse sync from the live copy back to the old one.
    const rev = this.d.opsFor(rec.toDb, rec.fromDb);
    const progress: MoveProgress = { ...emptyProgress(), ...rec.progress };
    const key = progress as MoveProgress & { reverseCursor?: number };
    key.reverseCursor ??= 0;
    try {
      await rev.freeze(shard, this.o.freezeMs);
      if (!(await rev.drain(shard, this.o.drainTimeoutMs))) {
        throw new Error(
          'writers did not finish within the drain timeout; retry rollback',
        );
      }
      let backlog = await rev.backlog(shard, key.reverseCursor);
      while (backlog > 0) {
        await lease.assertHeld();
        await rev.freeze(shard, this.o.freezeMs);
        const r = await rev.applyLog(
          shard,
          key.reverseCursor,
          this.o.batchSize,
        );
        key.reverseCursor = r.lastId;
        backlog = await rev.backlog(shard, key.reverseCursor);
      }
      const result = await rev.verify(shard);
      if (!result.ok) throw new MoveVerifyError(result);
      await lease.assertHeld();
      await this.d.store.flipMap(shard, rec.fromDb);
    } catch (e) {
      const now = await this.d.store.mapOf(shard).catch(() => null);
      if (!now || now.physicalDb !== rec.fromDb) {
        await rev.unfreeze(shard).catch(() => undefined);
        await this.d.store.update(id, {
          progress: key,
          heartbeatAt: this.o.now(),
        });
        throw e;
      }
    }
    await this.d.sync.invalidate().catch(() => undefined);
    // The old copy is live again: lift its fence. The copy on the other
    // database is now the stale one and is fenced for good.
    await rev.fenceSource(shard);
    await rev.release(shard, 'target');
    const now = this.o.now();
    return this.d.store.update(id, {
      status: 'rolled_back',
      state: 'cleanup',
      progress: key,
      error: null,
      leftoverDb: rec.toDb,
      cleanupAfter: new Date(now.getTime() + this.o.keepDays * 86_400_000),
      heartbeatAt: now,
    });
  }

  /* ------------------------------------------------------ cleanup --- */

  /**
   * Deletes the stale rows (the old copy after a move, the abandoned copy
   * after a reversed move) once `cleanup_after` has passed, or at once with
   * `force`. The map must not point at the database being emptied.
   */
  async cleanup(
    id: string,
    opts: { force?: boolean } = {},
  ): Promise<MoveRecord> {
    const lease = await this.d.lease.acquire();
    if (!lease) throw new MoveRefusedError('another shard move is running');
    try {
      const rec = await this.must(id);
      const leftover = rec.leftoverDb;
      const waitingFlipped = rec.status === 'waiting';
      const reversed = rec.status === 'rolled_back' && !!leftover;
      if (!leftover || !(waitingFlipped || reversed)) {
        throw new MoveRefusedError(
          `move ${id} has nothing to clean up (${rec.status})`,
        );
      }
      if (
        !opts.force &&
        (!rec.cleanupAfter || rec.cleanupAfter > this.o.now())
      ) {
        throw new MoveRefusedError(
          `old rows are kept until ${rec.cleanupAfter?.toISOString() ?? 'n/a'}`,
        );
      }
      const shard = rec.logicalShard;
      const map = await this.d.store.mapOf(shard);
      if (map.physicalDb === leftover) {
        throw new MoveRefusedError(
          `shard ${shard} is served from ${leftover}; refusing to delete its rows`,
        );
      }
      const side = leftover === rec.fromDb ? 'source' : 'target';
      const ops = this.d.opsFor(rec.fromDb, rec.toDb);
      while ((await ops.purge(shard, side, this.o.batchSize)) > 0) {
        await lease.assertHeld();
      }
      await ops.release(shard, 'source');
      await ops.release(shard, 'target');
      return this.d.store.update(id, {
        status: reversed ? 'rolled_back' : 'done',
        state: 'done',
        leftoverDb: null,
        cleanupAfter: null,
        heartbeatAt: this.o.now(),
      });
    } finally {
      await lease.release().catch(() => undefined);
    }
  }
}
