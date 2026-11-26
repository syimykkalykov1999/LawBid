SET LOCAL lock_timeout = '5s';
-- STAGE2_SECURITY #13 (ASVS 5.0 V7.3.2 / V10.4.8): when the sign-in that
-- opened a refresh chain happened. Copied on every rotation, so the absolute
-- session lifetime (admin setting auth.session_absolute_days) is counted from
-- the sign-in, not from the last refresh. Nullable, no default: a metadata-only
-- change; chains opened before it fall back to their oldest row.
ALTER TABLE "sessions" ADD COLUMN "chain_started_at" TIMESTAMPTZ;
