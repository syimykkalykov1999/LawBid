-- migration-safety: contract messages, chat_group_messages and notifications get a composite primary key (id, chat/group/person id) and their child tables a conversation_id / group_id column with composite foreign keys; the tables stay plain (NOT partitioned), reads by id keep working, but old code inserting message_reactions / message_edits / message_hidden / saved_chat_messages rows without conversation_id fails for the seconds between this migration and the new release, so deploy the release right after
-- Owner 2026-10-26: EXPAND step for hash partitioning of the three
-- biggest-growing tables (docs/architecture/TABLE_PARTITIONING_READY.md).
-- The partitioning itself is NOT done here: at small sizes the plain tables
-- are faster (measured), so the online runner converts them only when the
-- admin switches it on («Вкл») or «Авто» at the growth threshold.
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
-- Safety: a table above 2 million rows RAISES before any change (the key
-- rebuild locks the table; do it by hand off-peak); lock_timeout 5 s; one
-- transaction, a failure rolls everything back; idempotent.

DO $$
DECLARE
  r record;
  v_rows bigint;
BEGIN
  SET LOCAL lock_timeout = '5s';
  FOR r IN SELECT unnest(ARRAY['messages', 'chat_group_messages', 'notifications']) AS tbl LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.' || r.tbl)
                AND c.contype = 'p' AND array_length(c.conkey, 1) = 1) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO v_rows;
      IF v_rows > 2000000 THEN
        RAISE EXCEPTION '% has % rows (limit 2000000): rebuild its key by hand off-peak', r.tbl, v_rows;
      END IF;
    END IF;
  END LOOP;
END $$;

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

-- 3. Composite primary keys (flat tables, rebuilt once while small) -------
-- (id, partition key). A lookup by id alone still uses the leading column of
-- the key, so nothing gets slower; the key is what the later online hash
-- conversion needs (the table is NOT partitioned here).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('messages', 'conversation_id'),
    ('chat_group_messages', 'group_id'),
    ('notifications', 'user_id')) AS v(tbl, key)
  LOOP
    IF (SELECT count(*) FROM pg_constraint c
         WHERE c.conrelid = to_regclass('public.' || r.tbl) AND c.contype = 'p'
           AND array_length(c.conkey, 1) = 2) = 0 THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tbl, r.tbl || '_pkey');
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id, %I)', r.tbl, r.tbl || '_pkey', r.key);
    END IF;
  END LOOP;
END $$;

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
