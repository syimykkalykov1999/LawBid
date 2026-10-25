import { PartitionRunner, type PartitionSpec } from './partition-runner';
import { prismaSql, type SqlDb } from './sql';

/**
 * HASH conversion through the online runner on a real PostgreSQL, on a small
 * copy of the messages shape (composite key, self reference of replies,
 * children with composite foreign keys, a BEFORE INSERT trigger) and of the
 * notifications shape. Skipped without PARTITION_TEST_URL (a throw-away
 * database, see scripts/ops/partition-selftest.sh).
 */
const URL = process.env.PARTITION_TEST_URL;
const d = URL ? describe : describe.skip;

d('hash conversion by the online runner', () => {
  const msg: PartitionSpec = {
    table: 'hp_message',
    key: 'conversation_id',
    label: 'm (хеш)',
    hash: 4,
  };
  const note: PartitionSpec = {
    table: 'hp_note',
    key: 'user_id',
    label: 'n (хеш)',
    hash: 4,
  };
  let db: SqlDb;
  let run: PartitionRunner;
  const one = async <T>(sql: string) => (await db.rows<T>(sql))[0];
  const count = async (t: string) =>
    (await one<{ n: number }>(`SELECT count(*)::bigint n FROM ${t}`)).n;
  const finish = async (spec: PartitionSpec, maxTicks = 300) => {
    for (let i = 0; i < maxTicks; i++) {
      const j = await run.job(spec.table);
      if (!j || ['swapped', 'done', 'aborted'].includes(j.phase) || j.error) {
        return j;
      }
      await run.tick(1);
    }
    return run.job(spec.table);
  };
  const kind = async (t: string) =>
    (
      await one<{ k: string }>(
        `SELECT relkind::text k FROM pg_class WHERE oid = to_regclass('public.${t}')`,
      )
    ).k;

  beforeAll(async () => {
    db = prismaSql(URL!);
    run = new PartitionRunner(db).allow(msg).allow(note);
    for (const t of [
      'hp_reaction',
      'hp_message',
      'hp_message__old',
      'hp_message__part',
      'hp_note',
      'hp_note__old',
      'hp_note__part',
      'hp_conversation',
    ]) {
      await db.run(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await db.run('DROP TABLE IF EXISTS public._partition_job');
    await db.run(
      `CREATE OR REPLACE FUNCTION hp_shard_fill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.shard_id := 7; RETURN NEW; END $$`,
    );
    await db.run(
      `CREATE TABLE hp_conversation (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
    );
    await db.run(`CREATE TABLE hp_message (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES hp_conversation(id),
      sender_id uuid, client_message_id text NOT NULL,
      reply_to_id uuid,
      shard_id smallint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), body text NOT NULL DEFAULT '',
      PRIMARY KEY (id, conversation_id),
      FOREIGN KEY (conversation_id, reply_to_id) REFERENCES hp_message (conversation_id, id) ON DELETE SET NULL (reply_to_id))`);
    await db.run(
      `CREATE UNIQUE INDEX hp_message_uq ON hp_message (conversation_id, sender_id, client_message_id)`,
    );
    await db.run(
      `CREATE INDEX hp_message_c ON hp_message (conversation_id, created_at DESC)`,
    );
    await db.run(
      `CREATE TRIGGER hp_message_shard BEFORE INSERT ON hp_message FOR EACH ROW WHEN (NEW.shard_id = 0) EXECUTE FUNCTION hp_shard_fill()`,
    );
    await db.run(`CREATE TABLE hp_reaction (
      message_id uuid NOT NULL, conversation_id uuid NOT NULL, user_id uuid NOT NULL,
      PRIMARY KEY (message_id, user_id),
      FOREIGN KEY (conversation_id, message_id) REFERENCES hp_message (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE)`);
    await db.run(`CREATE TABLE hp_note (
      id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      dedupe_key text, n int NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (id, user_id))`);
    await db.run(
      `CREATE UNIQUE INDEX hp_note_dd ON hp_note (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`,
    );
    await db.run(
      `CREATE INDEX hp_note_u ON hp_note (user_id, created_at DESC)`,
    );
    await db.run(
      `INSERT INTO hp_conversation SELECT gen_random_uuid() FROM generate_series(1, 30)`,
    );
    await db.run(`INSERT INTO hp_message (conversation_id, sender_id, client_message_id, created_at, body)
      SELECT c.id, c.id, 'c' || g, now() - (g || ' minutes')::interval, 'x'
        FROM hp_conversation c, generate_series(1, 40) g`);
    // every 5th message answers the previous one of its chat
    await db.run(`UPDATE hp_message m SET reply_to_id = p.id
      FROM hp_message p
     WHERE p.conversation_id = m.conversation_id
       AND p.client_message_id = 'c' || (substr(m.client_message_id, 2)::int - 1)
       AND substr(m.client_message_id, 2)::int % 5 = 0`);
    await db.run(`INSERT INTO hp_reaction (message_id, conversation_id, user_id)
      SELECT id, conversation_id, gen_random_uuid() FROM hp_message WHERE client_message_id IN ('c1', 'c5')`);
    await db.run(`INSERT INTO hp_note (user_id, dedupe_key, created_at)
      SELECT c.id, CASE WHEN g % 10 = 0 THEN 'k' || g END, now() - (g || ' minutes')::interval
        FROM hp_conversation c, generate_series(1, 30) g`);
    await db.run('ANALYZE hp_message');
  });

  afterAll(async () => {
    for (const t of [
      'hp_reaction',
      'hp_message',
      'hp_message__old',
      'hp_note',
      'hp_note__old',
      'hp_conversation',
    ]) {
      await db.run(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await db.run('DROP FUNCTION IF EXISTS hp_shard_fill()');
    await db.run('DROP TABLE IF EXISTS public._partition_job');
    await db.close();
  });

  it('precheck: needs the composite key; children and triggers are fine', async () => {
    expect((await run.precheck(msg)).reasons).toEqual([]);
    expect((await run.precheck(note)).ok).toBe(true);
    const bad = await run.precheck({
      table: 'hp_conversation',
      key: 'id',
      label: 'x',
      hash: 4,
    });
    expect(bad.ok).toBe(false);
  });

  it('converts messages online: replies, updates and deletes during the copy are kept', async () => {
    await run.start(msg, 'test');
    await run.tick(1); // prepare
    expect(await run.job('hp_message')).toMatchObject({
      phase: 'backfill',
      error: null,
    });
    // A new message answers an old one that is not copied yet: the forward
    // trigger carries the replied-to chain along.
    const c = await one<{ id: string }>(
      `SELECT id FROM hp_conversation ORDER BY id DESC LIMIT 1`,
    );
    const parent = await one<{ id: string }>(
      `SELECT id FROM hp_message WHERE conversation_id = '${c.id}' AND reply_to_id IS NULL LIMIT 1`,
    );
    await db.run(
      `INSERT INTO hp_message (conversation_id, sender_id, client_message_id, reply_to_id) VALUES ('${c.id}', '${c.id}', 'live1', '${parent.id}')`,
    );
    await db.run(
      `UPDATE hp_message SET body = 'edited' WHERE client_message_id = 'c3'`,
    );
    await db.run(`DELETE FROM hp_message WHERE client_message_id = 'c39'`);
    const j = await finish(msg);
    expect(j).toMatchObject({ phase: 'swapped', error: null });
    expect(await kind('hp_message')).toBe('p');
    expect(await count('hp_message')).toBe(await count('hp_message__old'));
    const diff = await one<{ n: number }>(
      `SELECT count(*)::int n FROM (SELECT id, conversation_id, body, reply_to_id FROM hp_message EXCEPT SELECT id, conversation_id, body, reply_to_id FROM hp_message__old) x`,
    );
    expect(diff.n).toBe(0);
    const parts = await one<{ n: number }>(
      `SELECT count(*)::int n FROM pg_inherits WHERE inhparent = 'hp_message'::regclass`,
    );
    expect(parts.n).toBe(4);
  });

  it('after the swap: key, rules, trigger and the children keys all hold', async () => {
    const pk = await one<{ d: string }>(
      `SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid = 'hp_message'::regclass AND contype = 'p'`,
    );
    expect(pk.d).toBe('PRIMARY KEY (id, conversation_id)');
    // The reaction key points at the NEW table and is validated.
    const fk = await one<{ ok: boolean; ref: string }>(
      `SELECT convalidated ok, confrelid::regclass::text ref FROM pg_constraint
        WHERE conrelid = 'hp_reaction'::regclass AND contype = 'f' AND conparentid = 0`,
    );
    expect(fk).toEqual({ ok: true, ref: 'hp_message' });
    await expect(
      db.run(
        `INSERT INTO hp_reaction (message_id, conversation_id, user_id) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid())`,
      ),
    ).rejects.toThrow();
    // Unique rule against a double send.
    const m = await one<{ conversation_id: string }>(
      `SELECT conversation_id FROM hp_message LIMIT 1`,
    );
    await expect(
      db.run(
        `INSERT INTO hp_message (conversation_id, sender_id, client_message_id) SELECT conversation_id, sender_id, client_message_id FROM hp_message WHERE conversation_id = '${m.conversation_id}' LIMIT 1`,
      ),
    ).rejects.toThrow(/already exists|duplicate key/);
    // The trigger came along.
    await db.run(
      `INSERT INTO hp_message (conversation_id, sender_id, client_message_id) VALUES ('${m.conversation_id}', '${m.conversation_id}', 'trg')`,
    );
    const t = await one<{ shard_id: number }>(
      `SELECT shard_id FROM hp_message WHERE client_message_id = 'trg'`,
    );
    expect(t.shard_id).toBe(7);
    // Self reference: deleting the replied-to message clears the link.
    const r = await one<{ id: string; reply_to_id: string; c: string }>(
      `SELECT id, reply_to_id, conversation_id c FROM hp_message WHERE reply_to_id IS NOT NULL LIMIT 1`,
    );
    await db.run(
      `DELETE FROM hp_message WHERE id = '${r.reply_to_id}' AND conversation_id = '${r.c}'`,
    );
    const after = await one<{ reply_to_id: string | null }>(
      `SELECT reply_to_id FROM hp_message WHERE id = '${r.id}' AND conversation_id = '${r.c}'`,
    );
    expect(after.reply_to_id).toBeNull();
    // Deleting a message removes its reactions (cascade through the new key).
    const withReaction = await one<{
      message_id: string;
      conversation_id: string;
    }>(`SELECT message_id, conversation_id FROM hp_reaction LIMIT 1`);
    await db.run(
      `DELETE FROM hp_message WHERE id = '${withReaction.message_id}' AND conversation_id = '${withReaction.conversation_id}'`,
    );
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int n FROM hp_reaction WHERE message_id = '${withReaction.message_id}'`,
        )
      ).n,
    ).toBe(0);
  });

  it('new rows reach the old table too, so undo is a safe rename', async () => {
    expect(await count('hp_message')).toBe(await count('hp_message__old'));
    await run.undo(msg);
    expect(await kind('hp_message')).toBe('r');
    const fk = await one<{ ref: string; ok: boolean }>(
      `SELECT confrelid::regclass::text ref, convalidated ok FROM pg_constraint
        WHERE conrelid = 'hp_reaction'::regclass AND contype = 'f' AND conparentid = 0`,
    );
    expect(fk).toEqual({ ref: 'hp_message', ok: true });
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int n FROM hp_message WHERE client_message_id = 'trg'`,
        )
      ).n,
    ).toBe(1);
    expect((await run.job('hp_message'))!.phase).toBe('aborted');
  });

  it('runs again, refuses early finalize, finalizes and needs no monthly upkeep', async () => {
    await run.start(msg, 'test');
    expect((await finish(msg))!.phase).toBe('swapped');
    await expect(run.finalize(msg)).rejects.toThrow(/рано/);
    await run.finalize(msg, true);
    expect((await run.job('hp_message'))!.phase).toBe('done');
    expect(
      (
        await one<{ t: string | null }>(
          `SELECT to_regclass('public.hp_message__old')::text t`,
        )
      ).t,
    ).toBeNull();
    expect(await run.ensureFuture('hp_message', 3)).toBe(0);
    expect(await kind('hp_message')).toBe('p');
  });

  it('converts a notifications-shaped table and keeps its dedupe upsert', async () => {
    await run.start(note, 'test');
    expect((await finish(note))!.phase).toBe('swapped');
    expect(await kind('hp_note')).toBe('p');
    expect(await count('hp_note')).toBe(await count('hp_note__old'));
    const r = await one<{ user_id: string; dedupe_key: string }>(
      `SELECT user_id, dedupe_key FROM hp_note WHERE dedupe_key IS NOT NULL LIMIT 1`,
    );
    for (let i = 0; i < 3; i += 1) {
      await db.run(`INSERT INTO hp_note (user_id, dedupe_key) VALUES ('${r.user_id}', '${r.dedupe_key}')
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET n = hp_note.n + 1`);
    }
    const n = await one<{ n: number; c: number }>(
      `SELECT max(n)::int n, count(*)::int c FROM hp_note WHERE user_id = '${r.user_id}' AND dedupe_key = '${r.dedupe_key}'`,
    );
    expect(n).toEqual({ n: 4, c: 1 });
    await run.undo(note);
    expect(await kind('hp_note')).toBe('r');
  });
});
