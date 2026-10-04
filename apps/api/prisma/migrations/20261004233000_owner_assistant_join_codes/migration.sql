-- Owner 2026-10-04: an assistant joins (and signs in again) with a one-time
-- code the attorney gets for each seat in the app — no SMS. The code is
-- stored hashed (lookup, globally unique) and encrypted (the attorney can
-- show and copy it again); the phone is no longer required.
ALTER TABLE "assistant_memberships" ALTER COLUMN "phone_e164" DROP NOT NULL;
ALTER TABLE "assistant_memberships" ADD COLUMN "join_code_hash" STRING NULL;
ALTER TABLE "assistant_memberships" ADD COLUMN "join_code_enc" STRING NULL;
ALTER TABLE "assistant_memberships" ADD COLUMN "join_code_expires_at" TIMESTAMPTZ NULL;
CREATE UNIQUE INDEX "assistant_memberships_join_code_hash_key" ON "assistant_memberships"("join_code_hash");
