-- Owner 2026-09-30 (OQ-043): direct chats from a profile ("Message") and
-- message requests like Instagram.
CREATE TYPE "message_request_status" AS ENUM ('none', 'pending', 'accepted', 'declined');
ALTER TABLE "conversations" ADD COLUMN "request_status" "message_request_status" NOT NULL DEFAULT 'none';
ALTER TABLE "conversations" ADD COLUMN "requested_by" UUID REFERENCES "users"("id") ON DELETE RESTRICT;
-- One direct chat per attorney/client pair.
CREATE UNIQUE INDEX "conversations_direct_pair_key" ON "conversations"("attorney_id", "client_id") WHERE "case_id" IS NULL;
