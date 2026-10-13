-- Owner 2026-10-13: contacts sync (like Instagram). The app sends SHA-256
-- hashes of normalized E.164 numbers; the server matches them against a
-- computed hash of users.phone_e164 and keeps only the matches. On
-- CockroachDB sha256(bytes) already returns the lowercase hex string (there
-- is no encode(string, string)); checked against hashlib.sha256 in Python.
ALTER TABLE "users" ADD COLUMN "phone_sha256" STRING
  AS (sha256("phone_e164"::BYTES)) STORED;
CREATE INDEX "users_phone_sha256_idx" ON "users" ("phone_sha256")
  WHERE "phone_sha256" IS NOT NULL;

CREATE TABLE "contact_matches" (
  "owner_id" UUID NOT NULL,
  "matched_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "contact_matches_pkey" PRIMARY KEY ("owner_id", "matched_id"),
  CONSTRAINT "contact_matches_owner_fkey" FOREIGN KEY ("owner_id")
    REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "contact_matches_matched_fkey" FOREIGN KEY ("matched_id")
    REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "contact_matches_not_self" CHECK ("owner_id" <> "matched_id")
);
CREATE INDEX "contact_matches_matched_id_idx" ON "contact_matches" ("matched_id");

CREATE TABLE "contact_sync_settings" (
  "user_id" UUID NOT NULL,
  "enabled" BOOL NOT NULL DEFAULT true,
  "synced_at" TIMESTAMPTZ,
  CONSTRAINT "contact_sync_settings_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "contact_sync_settings_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE CASCADE
);
