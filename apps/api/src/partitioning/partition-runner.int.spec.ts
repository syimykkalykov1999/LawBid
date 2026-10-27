import { PartitionRunner, type PartitionSpec } from './partition-runner';
import { prismaSql, type SqlDb } from './sql';

/**
 * End to end on a real PostgreSQL. Skipped unless PARTITION_TEST_URL points
 * at a throw-away database (superuser): see scripts/ops/partition-selftest.sh,
 * which starts one with docker. Never run it against a real database.
 */
const URL = process.env.PARTITION_TEST_URL;
const d = URL ? describe : describe.skip;

d('PartitionRunner on a real database', () => {
  const spec: PartitionSpec = {
    table: 'ptest_log',
    key: 'created_at',
    label: 't',
  };
  let db: SqlDb;
  let run: PartitionRunner;

  const count = async (t: string) =>
    (await db.rows<{ n: number }>(`SELECT count(*)::bigint n FROM ${t}`))[0].n;
  const finish = async (maxTicks = 200) => {
    for (let i = 0; i < maxTicks; i++) {
      const j = await run.job(spec.table);
      if (!j || ['swapped', 'done', 'aborted'].includes(j.phase) || j.error)
        return j;
      await run.tick(1); // one step per tick
    }
    return run.job(spec.table);
  };

  beforeAll(async () => {
    db = prismaSql(URL!);
    run = new PartitionRunner(db).allow(spec);
    await db.run('DROP TABLE IF EXISTS ptest_log CASCADE');
    await db.run('DROP TABLE IF EXISTS ptest_log__old CASCADE');
    await db.run('DROP TABLE IF EXISTS ptest_parent CASCADE');
    await db.run('DROP TABLE IF EXISTS public._partition_job');
    await db.run(
      'CREATE TABLE ptest_parent (id uuid PRIMARY KEY DEFAULT gen_random_uuid())',
    );
    await db.run(`CREATE TABLE ptest_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id uuid NOT NULL REFERENCES ptest_parent(id),
      action text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      meta jsonb)`);
    await db.run(
      'CREATE INDEX ptest_log_created_idx ON ptest_log (created_at DESC, id DESC)',
    );
    await db.run(
      'CREATE INDEX ptest_log_parent_idx ON ptest_log (parent_id, created_at DESC)',
    );
    await db.run(
      'INSERT INTO ptest_parent SELECT gen_random_uuid() FROM generate_series(1,5)',
    );
    await db.run(`INSERT INTO ptest_log (parent_id, action, created_at, meta)
      SELECT (SELECT id FROM ptest_parent ORDER BY random() LIMIT 1), 'a' || (g % 7),
             now() - (random() * 400 || ' days')::interval, jsonb_build_object('g', g)
        FROM generate_series(1, 30000) g`);
    await db.run('ANALYZE ptest_log');
  });

  afterAll(async () => {
    await db.run('DROP TABLE IF EXISTS ptest_log CASCADE');
    await db.run('DROP TABLE IF EXISTS ptest_log__old CASCADE');
    await db.run('DROP TABLE IF EXISTS ptest_parent CASCADE');
    await db.run('DROP TABLE IF EXISTS public._partition_job');
    await db.close();
  });

  it('dry run: plans, writes nothing', async () => {
    const plan = await run.plan(spec);
    expect(plan.precheck.ok).toBe(true);
    expect(plan.months).toBeGreaterThan(12);
    expect(plan.steps.length).toBe(8);
    const t = await db.rows<{ t: string | null }>(
      `SELECT to_regclass('public._partition_job')::text t`,
    );
    expect(t[0].t).toBeNull();
    expect((await run.stats('ptest_log')).partitioned).toBe(false);
  });

  it('refuses a table with foreign keys pointing at it', async () => {
    const pre = await run.precheck({
      table: 'ptest_parent',
      key: 'created_at',
      label: 'p',
    });
    expect(pre.ok).toBe(false);
  });

  it('converts online: writes during the copy are not lost', async () => {
    await run.start(spec, 'test');
    await run.tick(1); // prepare
    expect(await run.job('ptest_log')).toMatchObject({
      phase: 'backfill',
      error: null,
    });
    // Writes while the table is being copied (trigger keeps them in sync).
    await db.run(`INSERT INTO ptest_log (parent_id, action, created_at)
      SELECT id, 'live-insert', now() FROM ptest_parent LIMIT 3`);
    await db.run(
      `UPDATE ptest_log SET action = 'live-update' WHERE action = 'a1' AND created_at > now() - interval '30 days'`,
    );
    await db.run(
      `DELETE FROM ptest_log WHERE action = 'a2' AND created_at < now() - interval '300 days'`,
    );
    const j = await finish();
    expect(j!.phase).toBe('swapped');
    expect((await run.stats('ptest_log')).partitioned).toBe(true);
    expect(await count('ptest_log')).toBe(await count('ptest_log__old'));
    const diff = await db.rows<{ n: number }>(
      `SELECT count(*)::int n FROM (SELECT id, action, created_at FROM ptest_log EXCEPT SELECT id, action, created_at FROM ptest_log__old) x`,
    );
    expect(diff[0].n).toBe(0);
  });

  it('keeps names, indexes, foreign key and the wider primary key', async () => {
    const idx = await db.rows<{ n: string }>(
      `SELECT indexname n FROM pg_indexes WHERE tablename = 'ptest_log' ORDER BY 1`,
    );
    expect(idx.map((i) => i.n)).toEqual(
      expect.arrayContaining([
        'ptest_log_created_idx',
        'ptest_log_parent_idx',
        'ptest_log_pkey',
      ]),
    );
    const pk = await db.rows<{ d: string }>(
      `SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid = 'ptest_log'::regclass AND contype = 'p'`,
    );
    expect(pk[0].d).toBe('PRIMARY KEY (id, created_at)');
    await expect(
      db.run(
        `INSERT INTO ptest_log (parent_id, action) VALUES (gen_random_uuid(), 'bad')`,
      ),
    ).rejects.toThrow();
  });

  it('after the swap new rows reach the old table too (so undo is safe)', async () => {
    await db.run(
      `INSERT INTO ptest_log (parent_id, action) SELECT id, 'after-swap' FROM ptest_parent LIMIT 1`,
    );
    expect(await count('ptest_log')).toBe(await count('ptest_log__old'));
  });

  it('refuses to finalize early, undoes by a rename, and can run again', async () => {
    await expect(run.finalize(spec)).rejects.toThrow(/рано/);
    await run.undo(spec);
    expect((await run.stats('ptest_log')).partitioned).toBe(false);
    expect((await run.job('ptest_log'))!.phase).toBe('aborted');
    const lost = await db.rows<{ n: number }>(
      `SELECT count(*)::int n FROM ptest_log WHERE action = 'after-swap'`,
    );
    expect(lost[0].n).toBe(1);
    await run.start(spec, 'test');
    const j = await finish();
    expect(j!.phase).toBe('swapped');
    await run.finalize(spec, true);
    expect((await run.job('ptest_log'))!.phase).toBe('done');
    expect(
      (
        await db.rows<{ t: string | null }>(
          `SELECT to_regclass('public.ptest_log__old')::text t`,
        )
      )[0].t,
    ).toBeNull();
    expect(await run.ensureFuture('ptest_log', 2)).toBeGreaterThanOrEqual(0);
  });

  it('pause stops the work and abort leaves the table untouched', async () => {
    await db.run(`DROP TABLE ptest_log CASCADE`);
    await db.run(
      `CREATE TABLE ptest_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid NOT NULL, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), meta jsonb)`,
    );
    await db.run(`CREATE INDEX ON ptest_log (created_at)`);
    await db.run(
      `INSERT INTO ptest_log (parent_id, action) SELECT gen_random_uuid(), 'x' FROM generate_series(1,100)`,
    );
    await run.start(spec, 'test');
    await run.pause('ptest_log', true);
    const before = await run.job('ptest_log');
    await run.tick(1);
    expect((await run.job('ptest_log'))!.phase).toBe(before!.phase);
    await run.abort(spec);
    expect((await run.stats('ptest_log')).partitioned).toBe(false);
    expect(await count('ptest_log')).toBe(100);
  });
});
