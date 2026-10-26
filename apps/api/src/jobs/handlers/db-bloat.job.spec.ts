import {
  HEAVY_CRON_JOBS,
  type BloatSnapshot,
} from '../../common/ops/ops.constants';
import { CRON_JOBS } from '../jobs.constants';
import {
  BLOAT_MIN_BYTES,
  BLOAT_WARN_PERCENT,
  DbBloatJob,
  btreeBloatPercent,
} from './db-bloat.job';

const MB = 1024 * 1024;

/** $queryRaw is a tagged template; route by what the SQL text mentions. */
function build(opts: {
  ext: boolean;
  mode?: string;
  scanMaxMb?: number;
  tables: Record<
    string,
    {
      bytes: number;
      dead?: number;
      free?: number;
      live?: bigint;
      deadTup?: bigint;
      /** Index: real bytes, rows and key width (statistics estimate). */
      index?: { bytes: number; tuples: number; width: number };
    }
  >;
}) {
  const saved: unknown[] = [];
  const prisma = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('pg_extension'))
          return Promise.resolve([{ n: opts.ext ? 1 : 0 }]);
        const qualified = values.find(
          (v): v is string => typeof v === 'string' && v.startsWith('public.'),
        );
        const table = (qualified ?? '').replace('public.', '');
        const t = opts.tables[table];
        if (sql.includes('pg_table_size'))
          return Promise.resolve([{ heap: t ? BigInt(t.bytes) : null }]);
        if (sql.includes('pgstattuple_approx'))
          return Promise.resolve([{ dead: t.dead ?? 0, free: t.free ?? 0 }]);
        if (sql.includes('pgstatindex'))
          throw new Error('indexes must never be read (R-25)');
        if (sql.includes('pg_stats'))
          return Promise.resolve(
            t.index === undefined ? [] : [{ name: `${table}_idx`, ...t.index }],
          );
        if (sql.includes('pg_stat_user_tables'))
          return Promise.resolve([
            { live: t.live ?? 0n, dead: t.deadTup ?? 0n },
          ]);
        return Promise.resolve([]);
      },
    ),
  };
  const state = {
    setBloat: jest.fn((s: unknown) => (saved.push(s), Promise.resolve())),
  };
  const settings = {
    string: jest.fn(() => Promise.resolve(opts.mode ?? 'auto')),
    number: jest.fn(() => Promise.resolve(opts.scanMaxMb ?? 256)),
  };
  const job = new DbBloatJob(
    prisma as never,
    state as never,
    settings as never,
  );
  return {
    job,
    run: async () => (await job.run()) as BloatSnapshot,
    prisma,
    state,
    saved,
  };
}

// 1M rows of a uuid key fit in ~31 MB of btree; 2x that is ~50 % bloat.
const IDX_OK = { bytes: 31 * MB, tuples: 1_000_000, width: 16 };
const IDX_FAT = { bytes: 62 * MB, tuples: 1_000_000, width: 16 };

describe('btreeBloatPercent (statistics estimate, no index read)', () => {
  it('is ~0 for a fresh index and ~50 % for one twice the expected size', () => {
    expect(btreeBloatPercent(IDX_OK.bytes, IDX_OK.tuples, 16)).toBeLessThan(5);
    const fat = btreeBloatPercent(IDX_FAT.bytes, IDX_FAT.tuples, 16);
    expect(fat).toBeGreaterThan(45);
    expect(fat).toBeLessThan(55);
    expect(btreeBloatPercent(0, 10, 16)).toBe(0);
  });
});

describe('DbBloatJob', () => {
  it('«Вкл»: a big table with 40 % wasted space and a fat index are over the line', async () => {
    const { run, state } = build({
      ext: true,
      mode: 'on',
      tables: {
        messages: { bytes: 200 * MB, dead: 10, free: 30, index: IDX_OK },
        posts: { bytes: 200 * MB, dead: 1, free: 4, index: IDX_FAT },
      },
    });
    const snap = await run();
    expect(snap.source).toBe('pgstattuple');
    const by = Object.fromEntries(snap.tables.map((t) => [t.table, t]));
    expect(by.messages.bloatPercent).toBe(40);
    expect(by.posts.worstIndexBloatPercent).toBeGreaterThan(BLOAT_WARN_PERCENT);
    expect(snap.over.sort()).toEqual(['messages', 'posts']);
    expect(state.setBloat).toHaveBeenCalledWith(snap);
  });

  it('«Авто»: the heap estimate runs only where statistics show 10 %+ dead rows', async () => {
    const { run, prisma } = build({
      ext: true,
      tables: {
        messages: {
          bytes: 200 * MB,
          dead: 10,
          free: 30,
          live: 950n,
          deadTup: 50n,
        },
        posts: {
          bytes: 200 * MB,
          dead: 20,
          free: 20,
          live: 800n,
          deadTup: 200n,
        },
      },
    });
    const snap = await run();
    const by = Object.fromEntries(snap.tables.map((t) => [t.table, t]));
    expect(by.messages.bloatPercent).toBe(5); // statistics only
    expect(by.posts.bloatPercent).toBe(40); // estimate ran
    const approx = prisma.$queryRaw.mock.calls.filter((c) =>
      c[0].join('?').includes('pgstattuple_approx'),
    );
    expect(approx).toHaveLength(1);
  });

  it('a table above db.bloat_scan_max_mb is never read, statistics only', async () => {
    const { run, prisma } = build({
      ext: true,
      mode: 'on',
      scanMaxMb: 100,
      tables: {
        messages: {
          bytes: 500 * MB,
          dead: 50,
          free: 40,
          live: 700n,
          deadTup: 300n,
        },
      },
    });
    const snap = await run();
    expect(snap.tables[0].bloatPercent).toBe(30);
    expect(
      prisma.$queryRaw.mock.calls.some((c) =>
        c[0].join('?').includes('pgstattuple_approx'),
      ),
    ).toBe(false);
  });

  it('«Выкл» does nothing', async () => {
    const { job, prisma } = build({ ext: true, mode: 'off', tables: {} });
    expect(await job.run()).toEqual({ skipped: 'mode_off' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('small tables never raise the light, whatever their ratio', async () => {
    const { run } = build({
      ext: true,
      mode: 'on',
      tables: { messages: { bytes: BLOAT_MIN_BYTES - 1, dead: 50, free: 40 } },
    });
    const snap = await run();
    expect(snap.over).toEqual([]);
  });

  it('without the extension it falls back to the dead-row ratio', async () => {
    const { run } = build({
      ext: false,
      tables: { messages: { bytes: 900 * MB, live: 600n, deadTup: 400n } },
    });
    const snap = await run();
    expect(snap.source).toBe('stats');
    expect(snap.tables[0].bloatPercent).toBe(40);
    expect(snap.over).toEqual(['messages']);
  });

  it('a table that does not exist yet is skipped', async () => {
    const { run } = build({ ext: true, tables: {} });
    expect((await run()).tables).toEqual([]);
  });

  it('is a heavy job: the «Пауза тяжёлых задач» switch skips it', () => {
    expect(HEAVY_CRON_JOBS).toContain(CRON_JOBS.dbBloat);
  });
});
