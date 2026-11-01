SET LOCAL lock_timeout = '5s';
-- Checklist reconciliation 2026-11-01 (messages "sequence numbers", WhatsApp /
-- Telegram style): every message gets a per-chat number 1, 2, 3, ... so a
-- client can see a gap ("I have 41, 42, 44: ask for 43") without relying on
-- clocks or the afterId cursor.
--
-- The number is assigned by a BEFORE INSERT trigger, so every write path
-- (chat, calls, system messages, demo seed, future code) gets one with no
-- application change. `conversations.last_seq` is the counter; the UPDATE
-- takes the chat's row lock, so two concurrent sends in ONE chat serialize
-- (microseconds) and never take the same number; different chats don't wait.
-- A rolled-back send rolls the counter back too: numbers have no holes.
--
-- Expand-only for the running release: a nullable column and a counter with a
-- default; nothing reads them yet. Existing rows are numbered once below by
-- (created_at, id) under a short write lock (the table is small before launch;
-- a later large table would use the batched variant in docs/runbooks).
ALTER TABLE "conversations" ADD COLUMN "last_seq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "messages" ADD COLUMN "seq" INTEGER;

LOCK TABLE "messages" IN SHARE ROW EXCLUSIVE MODE;

WITH numbered AS (
  SELECT "conversation_id", "id",
         row_number() OVER (PARTITION BY "conversation_id" ORDER BY "created_at", "id")::int AS rn
  FROM "messages"
)
UPDATE "messages" m SET "seq" = n.rn
FROM numbered n
WHERE m."conversation_id" = n."conversation_id" AND m."id" = n."id";

UPDATE "conversations" c SET "last_seq" = s.mx
FROM (SELECT "conversation_id", max("seq") AS mx FROM "messages" GROUP BY "conversation_id") s
WHERE c."id" = s."conversation_id";

CREATE UNIQUE INDEX "messages_conversation_id_seq_key" ON "messages"("conversation_id", "seq");

CREATE FUNCTION messages_assign_seq() RETURNS trigger AS $$
BEGIN
  UPDATE "conversations" SET "last_seq" = "last_seq" + 1
  WHERE "id" = NEW."conversation_id"
  RETURNING "last_seq" INTO NEW."seq";
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_assign_seq_trg
  BEFORE INSERT ON "messages"
  FOR EACH ROW WHEN (NEW."seq" IS NULL)
  EXECUTE FUNCTION messages_assign_seq();
