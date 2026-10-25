import {
  BLOAT_MIN_BYTES,
  BLOAT_WARN_PERCENT,
  DbBloatJob,
} from './db-bloat.job';

const MB = 1024 * 1024;

/** $queryRaw is a tagged template; route by what the SQL text mentions. */
function build(opts: {
  ext: boolean;
  tables: Record<
    string,
    {
      bytes: number;
      dead?: number;
      free?: number;
      live?: bigint;
      deadTup?: bigint;
      indexDensity?: number;
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
          return Promise.resolve(
            t.indexDensity === undefined
              ? []
              : [{ name: `${table}_idx`, density: t.indexDensity }],
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
  return { job: new DbBloatJob(prisma as never, state as never), state, saved };
}

describe('DbBloatJob', () => {
  it('pgstattuple: a big table with 40 % wasted space is reported over the line', async () => {
    const { job, state } = build({
      ext: true,
      tables: {
        messages: { bytes: 500 * MB, dead: 10, free: 30, indexDensity: 90 },
        posts: { bytes: 500 * MB, dead: 1, free: 4, indexDensity: 40 },
      },
    });
    const snap = await job.run();
    expect(snap.source).toBe('pgstattuple');
    const by = Object.fromEntries(snap.tables.map((t) => [t.table, t]));
    expect(by.messages.bloatPercent).toBe(40);
    // posts: table is fine but its index is 55 % empty (density 40 of 90)
    expect(by.posts.worstIndexBloatPercent).toBeGreaterThan(BLOAT_WARN_PERCENT);
    expect(snap.over.sort()).toEqual(['messages', 'posts']);
    expect(state.setBloat).toHaveBeenCalledWith(snap);
  });

  it('small tables never raise the light, whatever their ratio', async () => {
    const { job } = build({
      ext: true,
      tables: { messages: { bytes: BLOAT_MIN_BYTES - 1, dead: 50, free: 40 } },
    });
    const snap = await job.run();
    expect(snap.over).toEqual([]);
  });

  it('without the extension it falls back to the dead-row ratio', async () => {
    const { job } = build({
      ext: false,
      tables: { messages: { bytes: 900 * MB, live: 600n, deadTup: 400n } },
    });
    const snap = await job.run();
    expect(snap.source).toBe('stats');
    expect(snap.tables[0].bloatPercent).toBe(40);
    expect(snap.over).toEqual(['messages']);
  });

  it('a table that does not exist yet is skipped', async () => {
    const { job } = build({ ext: true, tables: {} });
    expect((await job.run()).tables).toEqual([]);
  });
});
