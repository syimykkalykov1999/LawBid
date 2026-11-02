import { PartitionRunner, HASH_PARTITIONED } from './partition-runner';
import { prismaSql, type SqlDb } from './sql';

/**
 * The least-privilege role (migration 20261112110000) can really convert the
 * REAL `notifications` table with only the rights that migration gives it.
 * Needs a throw-away database with ALL migrations applied, the table owned
 * by lawbid_partition, and two URLs:
 *   PARTITION_REAL_URL  = lawbid_partition (what the worker gets)
 *   PARTITION_REAL_SEED = superuser (seeds rows, checks)
 * Run it on a FRESH database (it converts the tables for good).
 * Skipped otherwise. Never run it against a real database.
 */
const URL = process.env.PARTITION_REAL_URL;
const SEED = process.env.PARTITION_REAL_SEED;
const d = URL && SEED ? describe : describe.skip;

d('lawbid_partition converts the real notifications table', () => {
  let db: SqlDb;
  let admin: SqlDb;
  let run: PartitionRunner;
  const spec = HASH_PARTITIONED.find((s) => s.table === 'notifications')!;

  beforeAll(async () => {
    db = prismaSql(URL!);
    admin = prismaSql(SEED!);
    run = new PartitionRunner(db);
    await run.abort(spec).catch(() => undefined);
    await admin.run('DROP TABLE IF EXISTS public._partition_job');
    await admin.run(`DELETE FROM notifications`);
    await admin.run(
      `INSERT INTO users (updated_at) SELECT now() FROM generate_series(1, 20) ON CONFLICT DO NOTHING`,
    );
    await admin.tx(async (t) => {
      await t.run(`INSERT INTO notifications (user_id, type, category, payload)
        SELECT (SELECT id FROM users OFFSET (g % 20) LIMIT 1), (enum_range(NULL::notification_type))[1],
               (enum_range(NULL::notification_category))[1], '{}'::jsonb
          FROM generate_series(1, 3000) g`);
    });
  });
  afterAll(async () => {
    await db?.close();
    await admin?.close();
  });

  const convert = async (table: string) => {
    const spec = HASH_PARTITIONED.find((s) => s.table === table)!;
    await run.abort(spec).catch(() => undefined);
    await admin.run('DROP TABLE IF EXISTS public._partition_job');
    const pre = await run.precheck(spec);
    expect(pre.reasons).toEqual([]);
    await run.start(spec, 'test');
    for (let i = 0; i < 400; i++) {
      const j = await run.job(spec.table);
      if (!j || ['swapped', 'done', 'aborted'].includes(j.phase) || j.error) {
        expect(j?.error ?? null).toBeNull();
        break;
      }
      await run.tick(1);
    }
    const kind = await admin.rows<{ k: string }>(
      `SELECT relkind::text k FROM pg_class WHERE oid = 'public.${table}'::regclass`,
    );
    expect(kind[0].k).toBe('p');
    const n = await admin.rows<{ n: number }>(
      `SELECT count(*)::int n FROM ${table}`,
    );
    expect(n[0].n).toBe(3000);
  };

  it('converts notifications with the rights it has', () =>
    convert('notifications'));
  it('converts messages (children re-pointed)', async () => {
    await admin.run(`DELETE FROM messages`);
    await admin.run(`INSERT INTO conversations (attorney_id, client_id, updated_at)
      SELECT a.id, c.id, now() FROM (SELECT id FROM users LIMIT 5) a, (SELECT id FROM users OFFSET 5 LIMIT 1) c ON CONFLICT DO NOTHING`);
    await admin.run(`INSERT INTO messages (conversation_id, type, body_original, body_display, client_message_id, updated_at)
      SELECT (SELECT id FROM conversations OFFSET (g % 5) LIMIT 1), (enum_range(NULL::message_type))[1], 'x', 'x', 'c' || g, now()
        FROM generate_series(1, 3000) g`);
    await convert('messages');
  });
  it('converts chat_group_messages (children re-pointed)', async () => {
    await admin.run(`DELETE FROM chat_group_messages`);
    await admin.run(`INSERT INTO chat_groups (title, created_by, invite_code, updated_at)
      SELECT 'g' || g, (SELECT id FROM users LIMIT 1), 'code' || g, now() FROM generate_series(1, 5) g ON CONFLICT DO NOTHING`);
    await admin.run(`INSERT INTO chat_group_messages (group_id, type, client_message_id)
      SELECT (SELECT id FROM chat_groups OFFSET (g % 5) LIMIT 1), (enum_range(NULL::group_message_type))[1], 'c' || g
        FROM generate_series(1, 3000) g`);
    await convert('chat_group_messages');
  });
  it('cannot touch the append-only tables', async () => {
    await expect(db.rows(`SELECT 1 FROM audit_log LIMIT 1`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
