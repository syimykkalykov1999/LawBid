import { PartitionRunner, type PartitionSpec } from './partition-runner';
import { prismaSql, type SqlDb } from './sql';

/**
 * Month conversion keeps the table's own triggers (post_view_events has
 * `shard_fill`, a BEFORE INSERT trigger). Skipped unless PARTITION_TEST_URL
 * points at a throw-away database (superuser); see partition-runner.int.spec.ts.
 */
const URL = process.env.PARTITION_TEST_URL;
const d = URL ? describe : describe.skip;

d('PartitionRunner keeps triggers (month mode)', () => {
  const spec: PartitionSpec = {
    table: 'ptrg_log',
    key: 'created_at',
    label: 't',
  };
  let db: SqlDb;
  let run: PartitionRunner;

  const trigger = async () =>
    db.rows<{ n: string }>(
      `SELECT tgname n FROM pg_trigger
        WHERE tgrelid = 'public.ptrg_log'::regclass AND NOT tgisinternal
          AND tgname = 'ptrg_log_fill'`,
    );

  beforeAll(async () => {
    db = prismaSql(URL!);
    run = new PartitionRunner(db).allow(spec);
    for (const t of ['ptrg_log', 'ptrg_log__old']) {
      await db.run(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await db.run('DROP TABLE IF EXISTS public._partition_job');
    await db.run(`CREATE OR REPLACE FUNCTION ptrg_fill() RETURNS trigger
      LANGUAGE plpgsql AS $f$ BEGIN NEW.shard_id := 7; RETURN NEW; END $f$`);
    await db.run(`CREATE TABLE ptrg_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL,
      shard_id smallint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now())`);
    await db.run('CREATE INDEX ptrg_log_created_idx ON ptrg_log (created_at)');
    await db.run(`CREATE TRIGGER ptrg_log_fill BEFORE INSERT ON ptrg_log
      FOR EACH ROW WHEN (NEW.shard_id = 0) EXECUTE FUNCTION ptrg_fill()`);
    await db.run(`INSERT INTO ptrg_log (kind, created_at)
      SELECT 'view', now() - (g || ' days')::interval FROM generate_series(1, 500) g`);
  });

  afterAll(async () => {
    for (const t of ['ptrg_log', 'ptrg_log__old']) {
      await db.run(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await db.run('DROP FUNCTION IF EXISTS ptrg_fill()');
    await db.run('DROP TABLE IF EXISTS public._partition_job');
    await db.close();
  });

  it('the trigger fires before and after the swap', async () => {
    await db.run(`INSERT INTO ptrg_log (kind) VALUES ('before')`);
    expect(
      (
        await db.rows<{ s: number }>(
          `SELECT shard_id s FROM ptrg_log WHERE kind = 'before'`,
        )
      )[0].s,
    ).toBe(7);

    await run.start(spec, 'test');
    for (let i = 0; i < 200; i++) {
      const j = await run.job(spec.table);
      if (!j || ['swapped', 'done', 'aborted'].includes(j.phase) || j.error)
        break;
      await run.tick(1);
    }
    expect((await run.job(spec.table))!.phase).toBe('swapped');
    expect((await run.stats(spec.table)).partitioned).toBe(true);

    expect(await trigger()).toHaveLength(1);
    await db.run(`INSERT INTO ptrg_log (kind) VALUES ('after')`);
    const after = await db.rows<{ s: number }>(
      `SELECT shard_id s FROM ptrg_log WHERE kind = 'after'`,
    );
    expect(after[0].s).toBe(7);
    // the row reached the old table too (undo stays safe), with the filled value
    const old = await db.rows<{ s: number }>(
      `SELECT shard_id s FROM ptrg_log__old WHERE kind = 'after'`,
    );
    expect(old[0].s).toBe(7);
  });
});
