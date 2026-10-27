import { runBackfill } from './backfill.runner';
import { HealthBackfillGuard, type GuardProbes } from './backfill.guard';
import type {
  BackfillDb,
  BackfillDefinition,
  BackfillGuard,
  BackfillRow,
  BackfillStatus,
  BackfillStore,
  KeyRange,
} from './backfill.types';

/** In-memory store: keys are the integers 1..total. */
class FakeStore implements BackfillStore {
  row: BackfillRow | null = null;
  status: BackfillStatus = 'running';
  constructor(
    private readonly total: number,
    private readonly onProgress?: (n: number) => void,
  ) {}
  begin(
    def: BackfillDefinition,
    o: { batchSize: number; maxRowsPerSec: number; restart: boolean },
  ) {
    if (this.row?.status === 'done' && !o.restart)
      return Promise.resolve({ refused: 'already finished' });
    this.row ??= {
      name: def.name,
      status: 'running',
      table_name: def.table,
      cursor: null,
      processed: 0,
      total_estimate: this.total,
      batch_size: o.batchSize,
      max_rows_per_sec: o.maxRowsPerSec,
      pause_reason: null,
      last_error: null,
      started_at: new Date(),
      updated_at: new Date(),
      heartbeat_at: new Date(),
      finished_at: null,
    };
    if (o.restart) Object.assign(this.row, { cursor: null, processed: 0 });
    this.row.status = this.status;
    return Promise.resolve({ row: { ...this.row } });
  }
  get() {
    return Promise.resolve(this.row);
  }
  nextRange(
    _d: BackfillDefinition,
    cursor: string | null,
    size: number,
  ): Promise<KeyRange | null> {
    const lo = cursor === null ? 0 : Number(cursor);
    if (lo >= this.total) return Promise.resolve(null);
    return Promise.resolve({
      lo: cursor,
      hi: String(Math.min(this.total, lo + size)),
    });
  }
  progress(_n: string, cursor: string, rows: number) {
    if (this.row) {
      this.row.cursor = cursor;
      this.row.processed += rows;
    }
    this.onProgress?.(Number(cursor));
    return Promise.resolve(this.status);
  }
  heartbeat(_n: string, reason: string | null) {
    if (this.row) this.row.pause_reason = reason;
    return Promise.resolve(this.status);
  }
  finish() {
    if (this.row) this.row.status = 'done';
    return Promise.resolve();
  }
  fail(_n: string, error: string) {
    if (this.row)
      Object.assign(this.row, { status: 'failed', last_error: error });
    return Promise.resolve();
  }
  setStatus() {
    return Promise.resolve(this.row);
  }
  list() {
    return Promise.resolve(this.row ? [this.row] : []);
  }
  estimateTotal() {
    return Promise.resolve(this.total);
  }
}

const calm: BackfillGuard = { check: () => Promise.resolve(null) };
const db = {} as BackfillDb;

function def(
  applied: KeyRange[],
  over: Partial<BackfillDefinition> = {},
): BackfillDefinition {
  return {
    name: 'test-backfill',
    description: 'test',
    table: 'things',
    keyType: 'bigint',
    apply(_db, range) {
      applied.push(range);
      return Promise.resolve(Number(range.hi) - Number(range.lo ?? 0));
    },
    ...over,
  };
}

describe('runBackfill', () => {
  it('walks every key range once, in order, and finishes', async () => {
    const applied: KeyRange[] = [];
    const store = new FakeStore(25);
    const res = await runBackfill(def(applied), db, store, calm, {
      batchSize: 10,
      sleep: () => Promise.resolve(),
    });
    expect(res).toEqual({ outcome: 'done', processed: 25 });
    expect(applied).toEqual([
      { lo: null, hi: '10' },
      { lo: '10', hi: '20' },
      { lo: '20', hi: '25' },
    ]);
    expect(store.row?.status).toBe('done');
  });

  it('is resumable: a second run continues from the saved cursor', async () => {
    const applied: KeyRange[] = [];
    // stop after the first batch by aborting inside progress
    const stopper = new FakeStore(30, (n) => {
      if (n === 10) stopper.status = 'aborted';
    });
    const first = await runBackfill(def(applied), db, stopper, calm, {
      batchSize: 10,
      sleep: () => Promise.resolve(),
    });
    expect(first.outcome).toBe('aborted');
    expect(applied).toHaveLength(1);
    // continue with the same saved row
    stopper.status = 'running';
    const second = await runBackfill(def(applied), db, stopper, calm, {
      batchSize: 10,
      sleep: () => Promise.resolve(),
    });
    expect(second.outcome).toBe('done');
    expect(applied.map((a) => a.hi)).toEqual(['10', '20', '30']);
  });

  it('refuses a finished backfill unless restarted', async () => {
    const store = new FakeStore(5);
    await runBackfill(def([]), db, store, calm, {
      batchSize: 5,
      sleep: () => Promise.resolve(),
    });
    const again = await runBackfill(def([]), db, store, calm, {
      batchSize: 5,
      sleep: () => Promise.resolve(),
    });
    expect(again.outcome).toBe('refused');
    const applied: KeyRange[] = [];
    const restarted = await runBackfill(def(applied), db, store, calm, {
      batchSize: 5,
      restart: true,
      sleep: () => Promise.resolve(),
    });
    expect(restarted.outcome).toBe('done');
    expect(applied).toHaveLength(1);
  });

  it('waits while paused by an admin and continues after resume', async () => {
    const applied: KeyRange[] = [];
    const store = new FakeStore(20);
    store.status = 'paused';
    let sleeps = 0;
    const res = await runBackfill(def(applied), db, store, calm, {
      batchSize: 10,
      idleMs: 1000,
      sleep: () => {
        sleeps++;
        if (sleeps === 3) store.status = 'running';
        return Promise.resolve();
      },
    });
    expect(res.outcome).toBe('done');
    expect(sleeps).toBeGreaterThanOrEqual(3);
    expect(applied).toHaveLength(2);
  });

  it('gives up waiting while paused after maxPausedMs, state stays for the next run', async () => {
    const store = new FakeStore(20);
    store.status = 'paused';
    const res = await runBackfill(def([]), db, store, calm, {
      idleMs: 1000,
      maxPausedMs: 3000,
      sleep: () => Promise.resolve(),
    });
    expect(res.outcome).toBe('paused-timeout');
  });

  it('rests while the guard says the database is busy, records why, then goes on', async () => {
    const applied: KeyRange[] = [];
    const store = new FakeStore(10);
    let calls = 0;
    const busy: BackfillGuard = {
      check: () => Promise.resolve(++calls <= 2 ? 'replica lag 30s' : null),
    };
    const res = await runBackfill(def(applied), db, store, busy, {
      batchSize: 10,
      sleep: () => Promise.resolve(),
    });
    expect(res.outcome).toBe('done');
    expect(calls).toBeGreaterThan(2);
    expect(applied).toHaveLength(1);
  });

  it('throttles to maxRowsPerSec', async () => {
    const slept: number[] = [];
    let clock = 0;
    const res = await runBackfill(def([]), db, new FakeStore(30), calm, {
      batchSize: 10,
      maxRowsPerSec: 100,
      now: () => clock,
      sleep: (ms) => {
        slept.push(ms);
        clock += ms;
        return Promise.resolve();
      },
    });
    expect(res.outcome).toBe('done');
    // 10 rows at 100 rows/s = 100 ms per batch when a batch itself is instant
    expect(slept.filter((m) => m === 100)).toHaveLength(3);
  });

  it('a failing batch is recorded and stops the run (the cursor stays before it)', async () => {
    const store = new FakeStore(30);
    let n = 0;
    const res = await runBackfill(
      def([], {
        apply: () => {
          if (++n === 2) return Promise.reject(new Error('deadlock detected'));
          return Promise.resolve(10);
        },
      }),
      db,
      store,
      calm,
      { batchSize: 10, sleep: () => Promise.resolve() },
    );
    expect(res).toMatchObject({
      outcome: 'failed',
      processed: 10,
      detail: 'deadlock detected',
    });
    expect(store.row).toMatchObject({
      status: 'failed',
      cursor: '10',
      last_error: 'deadlock detected',
    });
  });
});

describe('HealthBackfillGuard', () => {
  const probes = (over: Partial<GuardProbes> = {}): GuardProbes => ({
    replicaLagSec: () => Promise.resolve(null),
    connectionRatio: () => Promise.resolve(0.2),
    dbCpuPercent: () => Promise.resolve(30),
    autovacuumOn: () => Promise.resolve(false),
    heavyPaused: () => Promise.resolve(false),
    ...over,
  });

  it('is calm when nothing is wrong or unknown (no replica, no CPU reading)', async () => {
    const g = new HealthBackfillGuard(
      probes({ dbCpuPercent: () => Promise.resolve(null) }),
    );
    await expect(g.check('messages')).resolves.toBeNull();
  });

  it.each([
    [{ replicaLagSec: () => Promise.resolve(25) }, 'replica lag 25s'],
    [{ dbCpuPercent: () => Promise.resolve(90) }, 'database CPU 90%'],
    [
      { connectionRatio: () => Promise.resolve(0.95) },
      'connections 95% of max',
    ],
    [
      { autovacuumOn: () => Promise.resolve(true) },
      'autovacuum is running on messages',
    ],
    [
      { heavyPaused: () => Promise.resolve(true) },
      'heavy background work is paused by the owner',
    ],
  ])('rests on %#', async (over, why) => {
    await expect(
      new HealthBackfillGuard(probes(over)).check('messages'),
    ).resolves.toBe(why);
  });

  it('a broken probe never blocks the work', async () => {
    const g = new HealthBackfillGuard(
      probes({ replicaLagSec: () => Promise.reject(new Error('no access')) }),
    );
    await expect(g.check('messages')).resolves.toBeNull();
  });
});
