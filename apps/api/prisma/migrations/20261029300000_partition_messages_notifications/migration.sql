-- migration-safety: contract messages, chat_group_messages and notifications are swapped for hash-partitioned twins in one transaction (same names and columns, the key gains the partition column); reads by id keep working, but old code inserting message_reactions / message_edits / message_hidden / saved_chat_messages rows without conversation_id fails for the seconds between this migration and the new release, so deploy the release right after
-- Owner 2026-10-26: partition the three biggest-growing tables NOW, while they
-- are tiny (docs/architecture/TABLE_PARTITIONING_READY.md). #334 left them
-- flat because a MONTHLY range key (created_at) cannot live in their unique
-- keys. A HASH key can: the key is a column that is already in every rule.
--
--   messages             PARTITION BY HASH (conversation_id), 16 partitions
--                        primary key (id, conversation_id)
--                        unique (conversation_id, sender_id, client_message_id)
--                        stays as is (it contains the key)
--   chat_group_messages  PARTITION BY HASH (group_id), 16 partitions
--                        primary key (id, group_id); same unique rule
--   notifications        PARTITION BY HASH (user_id), 16 partitions
--                        primary key (id, user_id); partial unique
--                        (user_id, dedupe_key) stays as is
--
-- Everything that pointed at messages(id) now points at
-- messages(conversation_id, id): message_reactions, message_edits,
-- message_hidden, message_pins, saved_chat_messages (they get a
-- conversation_id column, backfilled from the message) and the reply link
-- messages.reply_to_id. chat_group_polls and chat_group_messages.reply_to_id
-- point at chat_group_messages(group_id, id). A reply link can only point into
-- the same chat (it always did in the code).
--
-- Same safety as 20261026095000_partition_audit_auth: a table above 2 million
-- rows RAISES before any change (use the online runner then); lock_timeout 5 s;
-- one transaction, a failure rolls everything back; idempotent.

CREATE OR REPLACE FUNCTION lawbid_partition_table_by_hash(
  p_table text,
  p_pk text,          -- primary key columns, e.g. 'id, conversation_id'
  p_key text,         -- hash key column
  p_modulus integer,  -- number of partitions
  p_max_rows bigint DEFAULT 2000000
) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_old text := p_table || '__old';
  v_rows bigint;
  v_cols text;
  i integer;
  r record;
BEGIN
  IF (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', p_table))) = 'p' THEN
    RETURN; -- already partitioned
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_rows;
  IF v_rows > p_max_rows THEN
    RAISE EXCEPTION '% has % rows (limit %): use the online runner, not a migration', p_table, v_rows, p_max_rows;
  END IF;

  SET LOCAL lock_timeout = '5s';
  EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', p_table);

  CREATE TEMP TABLE _pt_idx ON COMMIT DROP AS
    SELECT pg_get_indexdef(x.indexrelid) AS def
      FROM pg_index x
     WHERE x.indrelid = to_regclass(format('public.%I', p_table)) AND NOT x.indisprimary;
  CREATE TEMP TABLE _pt_fk ON COMMIT DROP AS
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = to_regclass(format('public.%I', p_table)) AND contype = 'f';
  CREATE TEMP TABLE _pt_trg ON COMMIT DROP AS
    SELECT pg_get_triggerdef(oid) AS def
      FROM pg_trigger
     WHERE tgrelid = to_regclass(format('public.%I', p_table)) AND NOT tgisinternal;
  CREATE TEMP TABLE _pt_acl ON COMMIT DROP AS
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END AS grantee,
           a.privilege_type AS priv
      FROM pg_class c, aclexplode(c.relacl) a
     WHERE c.oid = to_regclass(format('public.%I', p_table)) AND a.grantee <> c.relowner;
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass(format('public.%I', p_table))
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

  EXECUTE format('ALTER TABLE public.%I RENAME TO %I', p_table, v_old);
  FOR r IN
    SELECT c.relname AS name, 'i' AS kind
      FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
     WHERE x.indrelid = to_regclass(format('public.%I', v_old)) AND NOT x.indisprimary
    UNION ALL
    SELECT conname, 'c' FROM pg_constraint
     WHERE conrelid = to_regclass(format('public.%I', v_old)) AND contype IN ('f', 'p')
  LOOP
    IF r.kind = 'i' THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.name, left(r.name, 55) || '__old');
    ELSE
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', v_old, r.name, left(r.name, 55) || '__old');
    END IF;
  END LOOP;

  EXECUTE format(
    'CREATE TABLE public.%I (LIKE public.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED INCLUDING STORAGE INCLUDING COMMENTS) PARTITION BY HASH (%I)',
    p_table, v_old, p_key);
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (%s)', p_table, p_table || '_pkey', p_pk);
  FOR i IN 0 .. p_modulus - 1 LOOP
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES WITH (MODULUS %s, REMAINDER %s)',
      p_table || '_h' || lpad(i::text, 2, '0'), p_table, p_modulus, i);
  END LOOP;

  FOR r IN SELECT def FROM _pt_idx LOOP
    EXECUTE r.def;
  END LOOP;
  FOR r IN SELECT conname, def FROM _pt_fk LOOP
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', p_table, r.conname, r.def);
  END LOOP;

  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM public.%I', p_table, v_cols, v_cols, v_old);

  FOR r IN SELECT def FROM _pt_trg LOOP
    EXECUTE r.def;
  END LOOP;

  FOR r IN
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END AS grantee
      FROM pg_class c, aclexplode(c.relacl) a
     WHERE c.oid = to_regclass(format('public.%I', p_table)) AND a.grantee <> c.relowner
     GROUP BY a.grantee
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM %s', p_table, r.grantee);
  END LOOP;
  FOR r IN SELECT grantee, priv FROM _pt_acl LOOP
    EXECUTE format('GRANT %s ON public.%I TO %s', r.priv, p_table, r.grantee);
  END LOOP;

  EXECUTE format('DROP TABLE public.%I', v_old);
  DROP TABLE _pt_idx;
  DROP TABLE _pt_fk;
  DROP TABLE _pt_trg;
  DROP TABLE _pt_acl;
END
$fn$;

-- 1. Children of messages get the chat id --------------------------------
ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE message_edits ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE message_hidden ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE saved_chat_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;

UPDATE message_reactions c SET conversation_id = m.conversation_id FROM messages m
 WHERE m.id = c.message_id AND c.conversation_id IS DISTINCT FROM m.conversation_id;
UPDATE message_edits c SET conversation_id = m.conversation_id FROM messages m
 WHERE m.id = c.message_id AND c.conversation_id IS DISTINCT FROM m.conversation_id;
UPDATE message_hidden c SET conversation_id = m.conversation_id FROM messages m
 WHERE m.id = c.message_id AND c.conversation_id IS DISTINCT FROM m.conversation_id;
UPDATE saved_chat_messages c SET conversation_id = m.conversation_id FROM messages m
 WHERE m.id = c.message_id AND c.conversation_id IS DISTINCT FROM m.conversation_id;
-- message_pins already has conversation_id; make it exactly the message's.
UPDATE message_pins c SET conversation_id = m.conversation_id FROM messages m
 WHERE m.id = c.message_id AND c.conversation_id IS DISTINCT FROM m.conversation_id;

ALTER TABLE message_reactions ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE message_edits ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE message_hidden ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE saved_chat_messages ALTER COLUMN conversation_id SET NOT NULL;

-- A reply may point only into its own chat (always true in the code); a
-- stray cross-chat link would break the composite key, so it is cleared.
UPDATE messages m SET reply_to_id = NULL
 WHERE m.reply_to_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM messages p WHERE p.id = m.reply_to_id AND p.conversation_id = m.conversation_id);
UPDATE chat_group_messages m SET reply_to_id = NULL
 WHERE m.reply_to_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM chat_group_messages p WHERE p.id = m.reply_to_id AND p.group_id = m.group_id);
UPDATE chat_group_polls c SET group_id = m.group_id FROM chat_group_messages m
 WHERE m.id = c.message_id AND c.group_id IS DISTINCT FROM m.group_id;

-- 2. Old single-column foreign keys go; the new ones come back below ------
ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_id_fkey;
ALTER TABLE message_edits DROP CONSTRAINT IF EXISTS message_edits_message_id_fkey;
ALTER TABLE message_hidden DROP CONSTRAINT IF EXISTS message_hidden_message_id_fkey;
ALTER TABLE message_pins DROP CONSTRAINT IF EXISTS message_pins_message_id_fkey;
ALTER TABLE saved_chat_messages DROP CONSTRAINT IF EXISTS saved_chat_messages_message_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_reply_to_id_fkey;
ALTER TABLE chat_group_polls DROP CONSTRAINT IF EXISTS chat_group_polls_message_id_fkey;
ALTER TABLE chat_group_messages DROP CONSTRAINT IF EXISTS chat_group_messages_reply_to_id_fkey;

-- 3. The conversions -------------------------------------------------------
SELECT lawbid_partition_table_by_hash('messages', 'id, conversation_id', 'conversation_id', 16);
SELECT lawbid_partition_table_by_hash('chat_group_messages', 'id, group_id', 'group_id', 16);
SELECT lawbid_partition_table_by_hash('notifications', 'id, user_id', 'user_id', 16);

-- 4. Composite foreign keys (the same cascade rules as before) ------------
-- Idempotent: the DROPs above and these ADDs only run through when the
-- single-column keys existed; a second run finds the composite ones.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_reactions_conversation_id_message_id_fkey') THEN
    ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_conversation_id_message_id_fkey
      FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE;
    ALTER TABLE message_edits ADD CONSTRAINT message_edits_conversation_id_message_id_fkey
      FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE;
    ALTER TABLE message_hidden ADD CONSTRAINT message_hidden_conversation_id_message_id_fkey
      FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE;
    ALTER TABLE message_pins ADD CONSTRAINT message_pins_conversation_id_message_id_fkey
      FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE;
    ALTER TABLE saved_chat_messages ADD CONSTRAINT saved_chat_messages_conversation_id_message_id_fkey
      FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE;
    -- SET NULL (reply_to_id) only: the chat id is part of the row's own key.
    ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_reply_to_id_fkey
      FOREIGN KEY (conversation_id, reply_to_id) REFERENCES messages (conversation_id, id) ON DELETE SET NULL (reply_to_id);
    ALTER TABLE chat_group_polls ADD CONSTRAINT chat_group_polls_group_id_message_id_fkey
      FOREIGN KEY (group_id, message_id) REFERENCES chat_group_messages (group_id, id) ON UPDATE CASCADE ON DELETE CASCADE;
    ALTER TABLE chat_group_messages ADD CONSTRAINT chat_group_messages_group_id_reply_to_id_fkey
      FOREIGN KEY (group_id, reply_to_id) REFERENCES chat_group_messages (group_id, id) ON DELETE SET NULL (reply_to_id);
  END IF;
END $$;

-- One-to-one links (a message has at most one pin / poll) need the pair unique
-- so Prisma can model the relation.
CREATE UNIQUE INDEX IF NOT EXISTS message_pins_conversation_id_message_id_key
  ON message_pins (conversation_id, message_id);
CREATE UNIQUE INDEX IF NOT EXISTS chat_group_polls_group_id_message_id_key
  ON chat_group_polls (group_id, message_id);

-- 5. Child indexes by message stay; the shard_fill triggers of the children
-- read the shard from the chat row (one probe) instead of messages by id.
DROP TRIGGER IF EXISTS "message_reactions_shard_fill" ON "message_reactions";
CREATE TRIGGER "message_reactions_shard_fill" BEFORE INSERT ON "message_reactions" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
DROP TRIGGER IF EXISTS "message_edits_shard_fill" ON "message_edits";
CREATE TRIGGER "message_edits_shard_fill" BEFORE INSERT ON "message_edits" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
DROP TRIGGER IF EXISTS "message_hidden_shard_fill" ON "message_hidden";
CREATE TRIGGER "message_hidden_shard_fill" BEFORE INSERT ON "message_hidden" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
DROP TRIGGER IF EXISTS "chat_group_polls_shard_fill" ON "chat_group_polls";
CREATE TRIGGER "chat_group_polls_shard_fill" BEFORE INSERT ON "chat_group_polls" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
