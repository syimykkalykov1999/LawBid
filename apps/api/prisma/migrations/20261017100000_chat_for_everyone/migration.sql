-- Owner 2026-10-17: direct chats between any two users (client ↔ client,
-- attorney ↔ attorney), like Instagram.
CREATE TYPE "chat_pair_kind" AS ENUM ('attorney_client', 'client_client', 'attorney_attorney');

ALTER TABLE "conversations"
  ADD COLUMN "pair_kind" "chat_pair_kind" NOT NULL DEFAULT 'attorney_client';
