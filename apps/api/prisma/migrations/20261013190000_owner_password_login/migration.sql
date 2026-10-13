-- Owner 2026-10-13: sign in with a password (like Instagram) so signing out
-- and in again does not cost an SMS each time. scrypt hash; null = the
-- account still signs in with an SMS code until it sets one.
ALTER TABLE "users" ADD COLUMN "password_hash" STRING;
ALTER TABLE "users" ADD COLUMN "password_set_at" TIMESTAMPTZ;
