/* eslint-disable @typescript-eslint/require-await -- fakes and sync-bodied interface methods */
import { MemoryMoveLease } from './move-lease';
import type { MoveTable } from './move-plan';
import {
  MoveRecord,
  PreflightResult,
  VerifyResult,
  emptyProgress,
} from './move-types';
import {
  MapEntry,
  MoveOps,
  MoveStore,
  ShardMoveRunner,
} from './shard-move.runner';

const T = (table: string): MoveTable => ({
  model: table,
  table,
  pk: ['id'],
  late: [],
  parents: [],
});

class FakeStore implements MoveStore {
  rows = new Map<string, MoveRecord>();
  map: MapEntry = { physicalDb: 'primary', state: 'active', version: 1 };
  flips: string[] = [];
  seq = 0;
  async create(i: {
    logicalShard: number;
    fromDb: string;
    toDb: string;
    requestedBy: string | null;
  }) {
    const r: MoveRecord = {
      id: `m${++this.seq}`,
      logicalShard: i.logicalShard,
      fromDb: i.fromDb,
      toDb: i.toDb,
      state: 'preflight',
      status: 'running',
      progress: emptyProgress(),
      plan: null,
      error: null,
      requestedBy: i.requestedBy,
      heartbeatAt: null,
      flippedAt: null,
      leftoverDb: null,
      cleanupAfter: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    this.rows.set(r.id, r);
    return r;
  }
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async update(id: string, patch: Partial<MoveRecord>) {
    const r = { ...this.rows.get(id)!, ...patch };
    this.rows.set(id, r);
    return r;
  }
  async activeFor(shard: number) {
    return (
      [...this.rows.values()].find(
        (r) =>
          r.logicalShard === shard &&
          ['running', 'waiting', 'failed'].includes(r.status),
      ) ?? null
    );
  }
  async mapOf() {
    return this.map;
  }
  async setMapState(_s: number, state: string) {
    this.map = { ...this.map, state };
  }
  async flipMap(_s: number, toDb: string) {
    this.flips.push(toDb);
    this.map = {
      physicalDb: toDb,
      state: 'active',
      version: this.map.version + 1,
    };
    return this.map.version;
  }
}

class FakeOps implements MoveOps {
  calls: string[] = [];
  backlogs: number[] = [];
  verifyOk = true;
  preflightProblems: string[] = [];
  failOn: string | null = null;
  purgeLeft = 2;
  tableList = [T('a'), T('b')];
  tables() {
    return this.tableList;
  }
  private rec(c: string) {
    this.calls.push(c);
    if (this.failOn === c) throw new Error(`boom ${c}`);
  }
  async preflight(): Promise<PreflightResult> {
    this.rec('preflight');
    return {
      ok: this.preflightProblems.length === 0,
      problems: this.preflightProblems,
      warnings: [],
      tables: [],
      totalRows: 10,
      estimatedSeconds: 1,
      fkDropped: { source: true, target: true },
      migrationsMatch: true,
    };
  }
  async prepare() {
    this.rec('prepare');
  }
  async copyBatch(_s: number, t: MoveTable, cursor: string | null) {
    this.rec(`copy:${t.table}:${cursor ?? 'start'}`);
    return cursor === null
      ? { rows: 5, cursor: 'c1', done: false }
      : { rows: 2, cursor: 'c2', done: true };
  }
  async fillLate() {
    this.rec('fillLate');
  }
  async backlog() {
    this.rec('backlog');
    return this.backlogs.length ? this.backlogs.shift()! : 0;
  }
  async applyLog(_s: number, after: number) {
    this.rec('applyLog');
    return { lastId: after + 10, entries: 10 };
  }
  async freeze() {
    this.rec('freeze');
  }
  async drain() {
    this.rec('drain');
    return true;
  }
  async verify(): Promise<VerifyResult> {
    this.rec('verify');
    return {
      ok: this.verifyOk,
      tables: [
        {
          table: 'a',
          sourceRows: 7,
          targetRows: this.verifyOk ? 7 : 6,
          sourceSum: '1',
          targetSum: '1',
          ok: this.verifyOk,
        },
      ],
    };
  }
  async armTarget() {
    this.rec('armTarget');
  }
  async fenceSource() {
    this.rec('fenceSource');
  }
  async unfreeze() {
    this.rec('unfreeze');
  }
  async release(_s: number, side: string) {
    this.rec(`release:${side}`);
  }
  async purge(_s: number, side: string) {
    this.rec(`purge:${side}`);
    return this.purgeLeft-- > 0 ? 3 : 0;
  }
}

function setup(over: Partial<FakeOps> = {}) {
  const store = new FakeStore();
  const ops = Object.assign(new FakeOps(), over);
  const lease = new MemoryMoveLease();
  let invalidations = 0;
  let now = new Date('2026-11-01T00:00:00Z');
  const runner = new ShardMoveRunner({
    store,
    lease,
    sync: { invalidate: async () => void invalidations++ },
    opsFor: () => ops,
    options: { catchupThreshold: 5, batchSize: 100, now: () => now },
  });
  return {
    store,
    ops,
    lease,
    runner,
    invalidations: () => invalidations,
    setNow: (d: Date) => (now = d),
  };
}

describe('ShardMoveRunner', () => {
  it('dry run plans without writing anything', async () => {
    const s = setup();
    const plan = await s.runner.plan(7, 'db1');
    expect(plan.ok).toBe(true);
    expect(plan.fromDb).toBe('primary');
    expect(s.ops.calls).toEqual(['preflight']);
    expect(s.store.rows.size).toBe(0);
  });

  it('plan refuses the database the shard is already on', async () => {
    const s = setup();
    const plan = await s.runner.plan(7, 'primary');
    expect(plan.ok).toBe(false);
    expect(plan.problems.join()).toMatch(/already on/);
  });

  it('enqueue refuses a second unfinished move of the same shard', async () => {
    const s = setup();
    await s.runner.enqueue(7, 'db1', null);
    await expect(s.runner.enqueue(7, 'db1', null)).rejects.toThrow(
      /unfinished/,
    );
  });

  it('preflight failure stops the move before anything is copied', async () => {
    const s = setup({ preflightProblems: ['target lacks migrations'] });
    const m = await s.runner.enqueue(7, 'db1', null);
    const r = await s.runner.run(m.id);
    expect(r.status).toBe('failed');
    expect(r.state).toBe('preflight');
    expect(r.error).toMatch(/migrations/);
    expect(s.ops.calls).toEqual(['preflight']);
    expect(s.store.map.state).toBe('active');
  });

  it('runs every state in order and flips with the invalidate', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', 'admin-1');
    const r = await s.runner.run(m.id);
    expect(r.status).toBe('waiting');
    expect(r.state).toBe('cleanup');
    expect(r.leftoverDb).toBe('primary');
    expect(r.cleanupAfter!.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(s.store.flips).toEqual(['db1']);
    expect(s.invalidations()).toBe(1);
    const c = s.ops.calls;
    const at = (x: string) => c.indexOf(x);
    expect(at('preflight')).toBeLessThan(at('prepare'));
    expect(at('prepare')).toBeLessThan(at('copy:a:start'));
    expect(at('copy:b:c1')).toBeLessThan(at('fillLate'));
    expect(at('fillLate')).toBeLessThan(at('freeze'));
    expect(at('verify')).toBeLessThan(at('armTarget'));
    expect(at('armTarget')).toBeLessThan(at('fenceSource'));
    // The old copy is NOT deleted by the move itself.
    expect(c.some((x) => x.startsWith('purge'))).toBe(false);
  });

  it('copy records per-table progress and resumes from the saved cursor', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    s.ops.failOn = 'copy:b:c1';
    const failed = await s.runner.run(m.id);
    expect(failed.status).toBe('failed');
    expect(failed.state).toBe('copy');
    const p = failed.progress;
    expect(p.tables.a.done).toBe(true);
    expect(p.tables.b).toMatchObject({ cursor: 'c1', done: false });
    s.ops.failOn = null;
    s.ops.calls.length = 0;
    const done = await s.runner.run(m.id);
    expect(done.status).toBe('waiting');
    // Table a is not copied a second time; b continues from its cursor.
    expect(s.ops.calls.filter((x) => x.startsWith('copy:a'))).toEqual([]);
    expect(s.ops.calls).toContain('copy:b:c1');
  });

  it('catch-up repeats until the backlog is under the threshold', async () => {
    const s = setup();
    s.ops.backlogs = [50, 30, 3];
    const m = await s.runner.enqueue(7, 'db1', null);
    const r = await s.runner.run(m.id);
    expect(r.status).toBe('waiting');
    expect(
      s.ops.calls.filter((x) => x === 'applyLog').length,
    ).toBeGreaterThanOrEqual(2);
    expect(r.progress.logCursor).toBeGreaterThan(0);
  });

  it('verify mismatch unfreezes, fails, and a retry goes back to the catch-up', async () => {
    const s = setup({ verifyOk: false });
    const m = await s.runner.enqueue(7, 'db1', null);
    const failed = await s.runner.run(m.id);
    expect(failed.status).toBe('failed');
    expect(failed.state).toBe('verify');
    expect(failed.error).toMatch(/verification failed/);
    expect(s.ops.calls).toContain('unfreeze');
    expect(s.store.flips).toEqual([]);
    expect(s.ops.calls).not.toContain('fenceSource');
    s.ops.verifyOk = true;
    const ok = await s.runner.run(m.id);
    expect(ok.status).toBe('waiting');
    expect(s.store.flips).toEqual(['db1']);
  });

  it('a failing flip lets writers back into the old copy', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    s.store.flipMap = async () => {
      throw new Error('primary down');
    };
    const r = await s.runner.run(m.id);
    expect(r.status).toBe('failed');
    expect(r.state).toBe('flip');
    expect(s.ops.calls.slice(-1)[0]).toBe('unfreeze');
  });

  it('a runner that loses the lease stops without touching the row', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    s.ops.copyBatch = async () => {
      s.lease.steal();
      return { rows: 1, cursor: 'x', done: false };
    };
    await expect(s.runner.run(m.id)).rejects.toThrow(/lease/);
    expect((await s.store.get(m.id))!.status).toBe('running');
  });

  it('only one runner at a time', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    s.lease.steal();
    await expect(s.runner.run(m.id)).rejects.toThrow(/another shard move/);
  });

  it('rollback before the flip deletes the target copy and keeps the shard where it was', async () => {
    const s = setup({ verifyOk: false });
    const m = await s.runner.enqueue(7, 'db1', null);
    await s.runner.run(m.id); // fails in verify, tracking still on
    s.ops.calls.length = 0;
    const r = await s.runner.rollback(m.id);
    expect(r.status).toBe('rolled_back');
    expect(s.store.map).toMatchObject({
      physicalDb: 'primary',
      state: 'active',
    });
    expect(s.ops.calls).toEqual([
      'unfreeze',
      'release:source',
      'purge:target',
      'purge:target',
      'purge:target',
      'release:target',
    ]);
    expect(s.store.flips).toEqual([]);
  });

  it('rollback after the flip reverse-syncs, flips back and keeps the stale copy for 7 days', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    await s.runner.run(m.id);
    s.ops.calls.length = 0;
    s.ops.backlogs = [12, 0];
    const r = await s.runner.rollback(m.id);
    expect(r.status).toBe('rolled_back');
    expect(r.leftoverDb).toBe('db1');
    expect(s.store.flips).toEqual(['db1', 'primary']);
    expect(s.ops.calls).toEqual(
      expect.arrayContaining([
        'freeze',
        'applyLog',
        'verify',
        'fenceSource',
        'release:target',
      ]),
    );
    expect(s.ops.calls.indexOf('verify')).toBeLessThan(
      s.ops.calls.indexOf('fenceSource'),
    );
  });

  it('cleanup refuses before 7 days, then deletes the old rows', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    await s.runner.run(m.id);
    await expect(s.runner.cleanup(m.id)).rejects.toThrow(/kept until/);
    s.setNow(new Date('2026-11-08T00:00:01Z'));
    s.ops.calls.length = 0;
    const r = await s.runner.cleanup(m.id);
    expect(r.status).toBe('done');
    expect(r.state).toBe('done');
    expect(s.ops.calls.filter((x) => x === 'purge:source').length).toBe(3);
    expect(s.ops.calls).toEqual(
      expect.arrayContaining(['release:source', 'release:target']),
    );
  });

  it('cleanup never empties the database that serves the shard', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    await s.runner.run(m.id);
    s.store.map = { ...s.store.map, physicalDb: 'primary' };
    await expect(s.runner.cleanup(m.id, { force: true })).rejects.toThrow(
      /refusing/,
    );
  });

  it('force cleanup works before the deadline', async () => {
    const s = setup();
    const m = await s.runner.enqueue(7, 'db1', null);
    await s.runner.run(m.id);
    const r = await s.runner.cleanup(m.id, { force: true });
    expect(r.status).toBe('done');
  });
});
