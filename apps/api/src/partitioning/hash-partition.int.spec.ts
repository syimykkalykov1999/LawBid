import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prismaSql, type SqlDb } from './sql';

/**
 * End to end on a real PostgreSQL (see scripts/ops/partition-selftest.sh):
 * the HASH conversion of migration 20261029300000 on a small copy of the
 * messages / notifications shape. Skipped without PARTITION_TEST_URL.
 */
const URL = process.env.PARTITION_TEST_URL;
const d = URL ? describe : describe.skip;

const MIGRATION = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20261029300000_partition_messages_notifications/migration.sql',
  ),
  'utf8',
);
// Only the helper function (the rest of the file needs the real schema).
const HELPER = MIGRATION.slice(
  MIGRATION.indexOf(
    'CREATE OR REPLACE FUNCTION lawbid_partition_table_by_hash',
  ),
  MIGRATION.indexOf('$fn$;', MIGRATION.indexOf('DROP TABLE _pt_acl;')) + 5,
);

d('hash partitioning of messages / notifications shape', () => {
  let db: SqlDb;
  const one = async <T>(sql: string) => (await db.rows<T>(sql))[0];

  beforeAll(async () => {
    db = prismaSql(URL!);
    for (const t of [
      'hp_reaction',
      'hp_message',
      'hp_note',
      'hp_conversation',
    ]) {
      await db.run(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await db.run(
      `CREATE TABLE hp_conversation (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
    );
    await db.run(`CREATE TABLE hp_message (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES hp_conversation(id),
      sender_id uuid, client_message_id text NOT NULL,
      reply_to_id uuid REFERENCES hp_message(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(), body text NOT NULL DEFAULT '')`);
    await db.run(
      `CREATE UNIQUE INDEX hp_message_uq ON hp_message (conversation_id, sender_id, client_message_id)`,
    );
    await db.run(
      `CREATE INDEX hp_message_c ON hp_message (conversation_id, created_at DESC)`,
    );
    await db.run(`CREATE TABLE hp_reaction (
      message_id uuid NOT NULL REFERENCES hp_message(id) ON DELETE CASCADE,
      user_id uuid NOT NULL, conversation_id uuid, PRIMARY KEY (message_id, user_id))`);
    await db.run(`CREATE TABLE hp_note (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      dedupe_key text, created_at timestamptz NOT NULL DEFAULT now(), n int NOT NULL DEFAULT 1)`);
    await db.run(
      `CREATE UNIQUE INDEX hp_note_dedupe ON hp_note (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`,
    );
    await db.run(
      `INSERT INTO hp_conversation SELECT gen_random_uuid() FROM generate_series(1, 40)`,
    );
    await db.run(`INSERT INTO hp_message (conversation_id, sender_id, client_message_id)
      SELECT c.id, c.id, 'c' || g FROM hp_conversation c, generate_series(1, 50) g`);
    await db.run(
      `INSERT INTO hp_reaction SELECT id, conversation_id, conversation_id FROM hp_message WHERE client_message_id = 'c1'`,
    );
    await db.run(`INSERT INTO hp_note (user_id, dedupe_key)
      SELECT gen_random_uuid(), CASE WHEN g % 2 = 0 THEN 'k' || g END FROM generate_series(1, 400) g`);
    await db.run(HELPER);
    // the same steps the migration takes for the children of messages
    await db.run(
      `ALTER TABLE hp_reaction DROP CONSTRAINT hp_reaction_message_id_fkey`,
    );
    await db.run(
      `ALTER TABLE hp_message DROP CONSTRAINT hp_message_reply_to_id_fkey`,
    );
    await db.run(
      `SELECT lawbid_partition_table_by_hash('hp_message', 'id, conversation_id', 'conversation_id', 8)`,
    );
    await db.run(
      `SELECT lawbid_partition_table_by_hash('hp_note', 'id, user_id', 'user_id', 8)`,
    );
    await db.run(
      `ALTER TABLE hp_reaction ADD CONSTRAINT hp_reaction_fk FOREIGN KEY (conversation_id, message_id) REFERENCES hp_message (conversation_id, id) ON DELETE CASCADE`,
    );
    await db.run(
      `ALTER TABLE hp_message ADD CONSTRAINT hp_message_reply_fk FOREIGN KEY (conversation_id, reply_to_id) REFERENCES hp_message (conversation_id, id) ON DELETE SET NULL (reply_to_id)`,
    );
    await db.run('ANALYZE hp_message');
  });

  afterAll(async () => {
    for (const t of [
      'hp_reaction',
      'hp_message',
      'hp_note',
      'hp_conversation',
    ]) {
      await db.run(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await db.run(
      'DROP FUNCTION IF EXISTS lawbid_partition_table_by_hash(text, text, text, integer, bigint)',
    );
    await db.close();
  });

  it('keeps every row, in 8 hash partitions, with the composite key', async () => {
    expect(
      (await one<{ n: number }>(`SELECT count(*)::int n FROM hp_message`)).n,
    ).toBe(2000);
    expect(
      (await one<{ n: number }>(`SELECT count(*)::int n FROM hp_note`)).n,
    ).toBe(400);
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int n FROM pg_inherits WHERE inhparent = 'hp_message'::regclass`,
        )
      ).n,
    ).toBe(8);
    expect(
      (
        await one<{ k: string }>(
          `SELECT pg_get_constraintdef(oid) k FROM pg_constraint WHERE conrelid = 'hp_message'::regclass AND contype = 'p'`,
        )
      ).k,
    ).toBe('PRIMARY KEY (id, conversation_id)');
  });

  it('refuses a duplicate client message id (still one unique rule)', async () => {
    const c = await one<{ id: string }>(
      `SELECT id FROM hp_conversation LIMIT 1`,
    );
    await expect(
      db.run(
        `INSERT INTO hp_message (conversation_id, sender_id, client_message_id) VALUES ('${c.id}', '${c.id}', 'c1')`,
      ),
    ).rejects.toThrow(/already exists|duplicate key/);
  });

  it('upserts a dedupe key (INSERT .. ON CONFLICT .. DO UPDATE)', async () => {
    const r = await one<{ user_id: string; dedupe_key: string }>(
      `SELECT user_id, dedupe_key FROM hp_note WHERE dedupe_key IS NOT NULL LIMIT 1`,
    );
    for (let i = 0; i < 3; i += 1) {
      await db.run(`INSERT INTO hp_note (user_id, dedupe_key) VALUES ('${r.user_id}', '${r.dedupe_key}')
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET n = hp_note.n + 1`);
    }
    const row = await one<{ n: number; c: number }>(
      `SELECT max(n)::int n, count(*)::int c FROM hp_note WHERE user_id = '${r.user_id}' AND dedupe_key = '${r.dedupe_key}'`,
    );
    expect(row).toEqual({ n: 4, c: 1 });
  });

  it('composite foreign keys: a wrong chat is refused, delete cascades', async () => {
    const m = await one<{ id: string; conversation_id: string }>(
      `SELECT id, conversation_id FROM hp_message WHERE client_message_id = 'c2' LIMIT 1`,
    );
    await expect(
      db.run(
        `INSERT INTO hp_reaction VALUES ('${m.id}', gen_random_uuid(), gen_random_uuid())`,
      ),
    ).rejects.toThrow(/foreign key/);
    await db.run(
      `INSERT INTO hp_reaction VALUES ('${m.id}', gen_random_uuid(), '${m.conversation_id}')`,
    );
    await db.run(
      `DELETE FROM hp_message WHERE id = '${m.id}' AND conversation_id = '${m.conversation_id}'`,
    );
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int n FROM hp_reaction WHERE message_id = '${m.id}'`,
        )
      ).n,
    ).toBe(0);
  });

  it('ON DELETE SET NULL (reply_to_id) keeps the chat id of the reply', async () => {
    const parent = await one<{ id: string; conversation_id: string }>(
      `SELECT id, conversation_id FROM hp_message WHERE client_message_id = 'c3' LIMIT 1`,
    );
    const child = await one<{ id: string }>(
      `INSERT INTO hp_message (conversation_id, sender_id, client_message_id, reply_to_id)
       VALUES ('${parent.conversation_id}', '${parent.conversation_id}', 'reply-1', '${parent.id}') RETURNING id`,
    );
    await db.run(
      `DELETE FROM hp_message WHERE id = '${parent.id}' AND conversation_id = '${parent.conversation_id}'`,
    );
    const after = await one<{
      reply_to_id: string | null;
      conversation_id: string;
    }>(
      `SELECT reply_to_id, conversation_id FROM hp_message WHERE id = '${child.id}'`,
    );
    expect(after.reply_to_id).toBeNull();
    expect(after.conversation_id).toBe(parent.conversation_id);
  });

  it('a query by chat reads one partition', async () => {
    const c = await one<{ id: string }>(
      `SELECT id FROM hp_conversation LIMIT 1`,
    );
    const plan = (
      await db.rows<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT * FROM hp_message WHERE conversation_id = '${c.id}' ORDER BY created_at DESC LIMIT 20`,
      )
    )
      .map((r) => r['QUERY PLAN'])
      .join('\n');
    expect((plan.match(/hp_message_h\d\d/g) ?? []).length).toBeGreaterThan(0);
    expect(new Set(plan.match(/hp_message_h\d\d/g)).size).toBe(1);
  });

  it('why the code never batches by ctid on a partitioned table', async () => {
    // ctid is only unique inside one partition: deleting "5 rows by ctid"
    // removes every row that shares one of those ctids in OTHER partitions.
    const before = (
      await one<{ n: number }>(`SELECT count(*)::int n FROM hp_note`)
    ).n;
    const del = await one<{ n: number }>(
      `WITH d AS (DELETE FROM hp_note WHERE (id, user_id) IN (SELECT id, user_id FROM hp_note ORDER BY created_at LIMIT 5) RETURNING 1) SELECT count(*)::int n FROM d`,
    );
    expect(del.n).toBe(5);
    expect(
      (await one<{ n: number }>(`SELECT count(*)::int n FROM hp_note`)).n,
    ).toBe(before - 5);
  });
});
