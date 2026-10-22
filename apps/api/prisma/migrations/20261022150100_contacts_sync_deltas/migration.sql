-- Owner 2026-10-22 (contacts sync like Telegram/WhatsApp, "do not load the
-- server"): the app checks a hash of its phone book first and sends only
-- the numbers added / removed since the last sync. The server keeps the
-- uploaded set (SHA-256 hashes only, never numbers) so a deleted contact
-- drops its match and a person who registers later is announced by the
-- server ("X joined LawBid").

ALTER TABLE "contact_sync_settings"
  ADD COLUMN "book_hash" CHAR(64),
  ADD COLUMN "book_size" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "matches_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notify_joined" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "contact_book_hashes" (
  "owner_id" UUID NOT NULL,
  "phone_sha256" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "contact_book_hashes_pkey" PRIMARY KEY ("owner_id", "phone_sha256")
);

-- "Who has this number in their book?" when someone registers.
CREATE INDEX "contact_book_hashes_phone_sha256_idx"
  ON "contact_book_hashes" ("phone_sha256");

ALTER TABLE "contact_book_hashes"
  ADD CONSTRAINT "contact_book_hashes_owner_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

-- Null = the people who have this number were not told yet. Accounts that
-- exist today count as announced: nobody gets a burst of old news.
ALTER TABLE "users" ADD COLUMN "contacts_announced_at" TIMESTAMPTZ;
UPDATE "users" SET "contacts_announced_at" = now();

-- The job reads only the few accounts still waiting.
CREATE INDEX "users_contacts_announce_pending_idx"
  ON "users" ("id")
  WHERE "contacts_announced_at" IS NULL AND "phone_verified_at" IS NOT NULL;
