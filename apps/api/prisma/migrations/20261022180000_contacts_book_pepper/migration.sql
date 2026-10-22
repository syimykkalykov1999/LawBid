-- Security research #5 (2026-10-22), A7: the stored phone-book hashes get
-- a server pepper. The column now holds HMAC-SHA256(CONTACTS_PEPPER,
-- sha256(E.164)) once the pepper is configured — hence the neutral name.
-- Existing rows stay as they are (plain sha256, `peppered = false`); the
-- API's contacts.pepper-backfill job re-hashes them in batches and reads
-- both forms until it is done. The app does not change.

ALTER TABLE "contact_book_hashes" RENAME COLUMN "phone_sha256" TO "phone_hash";
ALTER INDEX "contact_book_hashes_phone_sha256_idx" RENAME TO "contact_book_hashes_phone_hash_idx";

ALTER TABLE "contact_book_hashes"
  ADD COLUMN "peppered" BOOLEAN NOT NULL DEFAULT false;

-- The backfill walks the rows still waiting (and finds none, cheaply,
-- once it is done).
CREATE INDEX "contact_book_hashes_peppered_idx"
  ON "contact_book_hashes" ("peppered");
