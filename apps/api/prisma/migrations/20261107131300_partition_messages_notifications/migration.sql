-- Owner 2026-10-26: EXPAND step for hash partitioning of the three
-- biggest-growing tables (docs/architecture/TABLE_PARTITIONING_READY.md).
-- The partitioning itself is NOT done here: at small sizes the plain tables
-- are faster (measured), so the online runner converts them only when the
-- admin switches it on («Вкл») or «Авто» at the growth threshold. The opt-in
-- runner is the ONLY path that converts a table.
--
--   messages             primary key (id, conversation_id)
--   chat_group_messages  primary key (id, group_id)
--   notifications        primary key (id, user_id)
--
-- Everything that pointed at messages(id) now points at
-- messages(conversation_id, id): message_reactions, message_edits,
-- message_hidden, message_pins, saved_chat_messages (they get a
-- conversation_id column, backfilled from the message) and the reply link
-- messages.reply_to_id. chat_group_polls and chat_group_messages.reply_to_id
-- point at chat_group_messages(group_id, id). A reply link can only point into
-- the same chat (it always did in the code).
--
-- Lock-safe and expand-only (perf review 2026-10-26, R-19):
--   * the new keys were built as unique indexes CONCURRENTLY by the three
--     migrations before this one; here they become the primary keys with
--     USING INDEX (no index build, no table rewrite);
--   * new columns are nullable (catalog-only); NOT NULL comes through a
--     CHECK NOT VALID + VALIDATE, so SET NOT NULL does not scan again;
--   * foreign keys are added NOT VALID, then validated;
--   * a BEFORE INSERT trigger fills conversation_id when the previous
--     release inserts a reaction / edit / hide / saved row without it, so
--     the rolling deploy and a rollback keep working;
--   * size guard on the planner estimate (no count scan): when any of the
--     tables or their children holds more than 2 million rows, or a lock is
--     not granted within 5 s, NOTHING changes, a NOTICE is written and the
--     deploy goes on. Then run SELECT lawbid_messages_composite_keys(<rows>)
--     by hand off-peak (docs/runbooks/table-partitioning.md); until then the
--     runner card says the key is missing and stays blocked.
--   * all or nothing (one sub-transaction) and idempotent.

-- Fills the chat id of a child row from its message (previous release).
CREATE OR REPLACE FUNCTION lawbid_fill_conversation_id() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  SELECT m.conversation_id INTO NEW.conversation_id FROM public.messages m WHERE m.id = NEW.message_id;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION lawbid_messages_composite_keys(p_max_rows bigint DEFAULT 2000000)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_tables text[] := ARRAY['messages', 'chat_group_messages', 'notifications',
    'message_reactions', 'message_edits', 'message_hidden', 'message_pins',
    'saved_chat_messages', 'chat_group_polls'];
  v_children text[] := ARRAY['message_reactions', 'message_edits', 'message_hidden', 'saved_chat_messages'];
  v_known text[] := ARRAY['messages_reply_to_id_fkey', 'message_reactions_message_id_fkey',
    'message_edits_message_id_fkey', 'message_hidden_message_id_fkey', 'message_pins_message_id_fkey',
    'saved_chat_messages_message_id_fkey', 'chat_group_messages_reply_to_id_fkey',
    'chat_group_polls_message_id_fkey'];
  v_big text;
  v_bad text;
  t text;
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['messages', 'chat_group_messages', 'notifications']) AS v(tbl)
      JOIN pg_constraint k ON k.conrelid = to_regclass('public.' || v.tbl) AND k.contype = 'p'
     WHERE array_length(k.conkey, 1) = 1) THEN
    RETURN 'done already';
  END IF;

  -- 1. Size guard on the planner estimate (reltuples; never analysed: size).
  SELECT string_agg(format('%s ~%s rows', c.relname, GREATEST(c.reltuples, 0)::bigint), ', ')
    INTO v_big
    FROM pg_class c
   WHERE c.oid IN (SELECT to_regclass('public.' || x) FROM unnest(v_tables) AS x)
     AND (c.reltuples > p_max_rows
          OR (c.reltuples < 0 AND pg_relation_size(c.oid) > p_max_rows * 256));
  IF v_big IS NOT NULL THEN
    RAISE NOTICE 'composite keys of messages/notifications SKIPPED (limit % rows): %. Nothing changed. Run SELECT lawbid_messages_composite_keys(<rows>) off-peak, see docs/runbooks/table-partitioning.md', p_max_rows, v_big;
    RETURN 'skipped: big';
  END IF;

  -- 2. The unique indexes built CONCURRENTLY must be there and valid.
  SELECT string_agg(n, ', ') INTO v_bad
    FROM unnest(ARRAY['messages_id_conversation_id_key', 'chat_group_messages_id_group_id_key',
                      'notifications_id_user_id_key']) AS n
   WHERE NOT EXISTS (SELECT 1 FROM pg_index x
                      WHERE x.indexrelid = to_regclass('public.' || n) AND x.indisvalid AND x.indisunique);
  IF v_bad IS NOT NULL THEN
    RAISE NOTICE 'composite keys SKIPPED: index missing or invalid: % (rebuild it CONCURRENTLY, then run SELECT lawbid_messages_composite_keys())', v_bad;
    RETURN 'skipped: index';
  END IF;

  -- 3. Only the known single-column links may point at the old keys.
  SELECT string_agg(conname, ', ') INTO v_bad
    FROM pg_constraint
   WHERE contype = 'f'
     AND confrelid IN (to_regclass('public.messages'), to_regclass('public.chat_group_messages'), to_regclass('public.notifications'))
     AND array_length(conkey, 1) = 1
     AND conname <> ALL (v_known);
  IF v_bad IS NOT NULL THEN
    RAISE NOTICE 'composite keys SKIPPED: unknown foreign keys point at the old keys: %', v_bad;
    RETURN 'skipped: foreign keys';
  END IF;

  BEGIN
    PERFORM set_config('lock_timeout', '5s', true);

    -- 4. Children of messages get the chat id (nullable: catalog only).
    FOREACH t IN ARRAY v_children LOOP
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS conversation_id uuid', t);
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_conversation_fill', t);
      -- Name sorts before *_shard_fill, which reads conversation_id.
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW WHEN (NEW.conversation_id IS NULL) EXECUTE FUNCTION lawbid_fill_conversation_id()', t || '_conversation_fill', t);
      EXECUTE format('UPDATE public.%I c SET conversation_id = m.conversation_id FROM public.messages m WHERE m.id = c.message_id AND c.conversation_id IS DISTINCT FROM m.conversation_id', t);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (conversation_id IS NOT NULL) NOT VALID', t, t || '_conversation_id_nn');
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', t, t || '_conversation_id_nn');
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN conversation_id SET NOT NULL', t);
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, t || '_conversation_id_nn');
    END LOOP;
    -- message_pins already has conversation_id; make it exactly the one of the message.
    UPDATE message_pins c SET conversation_id = m.conversation_id FROM messages m
     WHERE m.id = c.message_id AND c.conversation_id IS DISTINCT FROM m.conversation_id;

    -- A stray cross-chat reply link would break the composite key: cleared.
    UPDATE messages m SET reply_to_id = NULL
     WHERE m.reply_to_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM messages p WHERE p.id = m.reply_to_id AND p.conversation_id = m.conversation_id);
    UPDATE chat_group_messages m SET reply_to_id = NULL
     WHERE m.reply_to_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM chat_group_messages p WHERE p.id = m.reply_to_id AND p.group_id = m.group_id);
    UPDATE chat_group_polls c SET group_id = m.group_id FROM chat_group_messages m
     WHERE m.id = c.message_id AND c.group_id IS DISTINCT FROM m.group_id;

    -- 5. Old single-column links go; the composite ones come back below.
    FOREACH t IN ARRAY v_known LOOP
      FOR r IN SELECT conrelid::regclass AS tbl FROM pg_constraint WHERE conname = t AND contype = 'f' LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, t);
      END LOOP;
    END LOOP;

    -- 6. Primary keys move onto the ready unique indexes (no rebuild).
    FOR r IN SELECT * FROM (VALUES
      ('messages', 'messages_id_conversation_id_key'),
      ('chat_group_messages', 'chat_group_messages_id_group_id_key'),
      ('notifications', 'notifications_id_user_id_key')) AS v(tbl, idx)
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I PRIMARY KEY USING INDEX %I',
                     r.tbl, r.tbl || '_pkey', r.tbl || '_pkey', r.idx);
    END LOOP;

    -- One-to-one links (a message has at most one pin / poll): the pair is
    -- unique so Prisma can model the relation (tiny tables).
    CREATE UNIQUE INDEX IF NOT EXISTS message_pins_conversation_id_message_id_key
      ON message_pins (conversation_id, message_id);
    CREATE UNIQUE INDEX IF NOT EXISTS chat_group_polls_group_id_message_id_key
      ON chat_group_polls (group_id, message_id);

    -- 7. Composite foreign keys (same cascade rules), NOT VALID then VALIDATE.
    FOR r IN SELECT * FROM (VALUES
      ('message_reactions', 'message_reactions_conversation_id_message_id_fkey', 'FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE'),
      ('message_edits', 'message_edits_conversation_id_message_id_fkey', 'FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE'),
      ('message_hidden', 'message_hidden_conversation_id_message_id_fkey', 'FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE'),
      ('message_pins', 'message_pins_conversation_id_message_id_fkey', 'FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE'),
      ('saved_chat_messages', 'saved_chat_messages_conversation_id_message_id_fkey', 'FOREIGN KEY (conversation_id, message_id) REFERENCES messages (conversation_id, id) ON UPDATE CASCADE ON DELETE CASCADE'),
      -- SET NULL (reply_to_id) only: the chat id is part of the own key of the row.
      ('messages', 'messages_conversation_id_reply_to_id_fkey', 'FOREIGN KEY (conversation_id, reply_to_id) REFERENCES messages (conversation_id, id) ON DELETE SET NULL (reply_to_id)'),
      ('chat_group_polls', 'chat_group_polls_group_id_message_id_fkey', 'FOREIGN KEY (group_id, message_id) REFERENCES chat_group_messages (group_id, id) ON UPDATE CASCADE ON DELETE CASCADE'),
      ('chat_group_messages', 'chat_group_messages_group_id_reply_to_id_fkey', 'FOREIGN KEY (group_id, reply_to_id) REFERENCES chat_group_messages (group_id, id) ON DELETE SET NULL (reply_to_id)')
    ) AS v(tbl, name, def)
    LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.name) THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s NOT VALID', r.tbl, r.name, r.def);
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', r.tbl, r.name);
      END IF;
    END LOOP;

    -- 8. The shard_fill triggers of the children read the shard from the
    -- chat row (one probe) instead of messages by id.
    DROP TRIGGER IF EXISTS "message_reactions_shard_fill" ON "message_reactions";
    CREATE TRIGGER "message_reactions_shard_fill" BEFORE INSERT ON "message_reactions" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
    DROP TRIGGER IF EXISTS "message_edits_shard_fill" ON "message_edits";
    CREATE TRIGGER "message_edits_shard_fill" BEFORE INSERT ON "message_edits" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
    DROP TRIGGER IF EXISTS "message_hidden_shard_fill" ON "message_hidden";
    CREATE TRIGGER "message_hidden_shard_fill" BEFORE INSERT ON "message_hidden" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
    DROP TRIGGER IF EXISTS "chat_group_polls_shard_fill" ON "chat_group_polls";
    CREATE TRIGGER "chat_group_polls_shard_fill" BEFORE INSERT ON "chat_group_polls" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
  EXCEPTION WHEN lock_not_available OR query_canceled THEN
    RAISE NOTICE 'composite keys SKIPPED: a table stayed busy past the 5 s lock_timeout (%). Nothing changed. Run SELECT lawbid_messages_composite_keys() off-peak', SQLERRM;
    RETURN 'skipped: busy';
  END;
  RETURN 'done';
END
$fn$;

SELECT lawbid_messages_composite_keys();
