SET LOCAL lock_timeout = '5s';

-- Detective R2B-14 (14.11): the unsubscribe secret is no longer kept in
-- the database. New links are signed HMAC tokens (no column at all); the
-- random tokens already printed in sent emails are kept only as sha256.
-- Additive: two nullable columns, the raw column may now be NULL (new
-- leads), and every existing row gets its hash at once so the old links
-- keep working. The raw value itself is cleared later by the outreach
-- retention job (after `outreach.raw_unsubscribe_token_keep_days`), so a
-- rollback to the previous release still finds it.
ALTER TABLE "outreach_leads" ADD COLUMN "unsubscribe_token_hash" VARCHAR(64);
ALTER TABLE "outreach_leads" ADD COLUMN "unsubscribe_token_hashed_at" TIMESTAMPTZ;
ALTER TABLE "outreach_leads" ALTER COLUMN "unsubscribe_token" DROP NOT NULL;

UPDATE "outreach_leads"
   SET "unsubscribe_token_hash" = encode(sha256(convert_to("unsubscribe_token", 'UTF8')), 'hex'),
       "unsubscribe_token_hashed_at" = now()
 WHERE "unsubscribe_token" IS NOT NULL
   AND "unsubscribe_token_hash" IS NULL;

CREATE UNIQUE INDEX "outreach_leads_unsubscribe_token_hash_key" ON "outreach_leads"("unsubscribe_token_hash");
