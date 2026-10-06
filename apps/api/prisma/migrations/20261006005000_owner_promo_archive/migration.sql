-- Owner 2026-10-05: promo codes can be deleted from the admin; a code that
-- was already used is archived instead so payment history stays intact.
ALTER TABLE "promo_codes" ADD COLUMN "archived_at" TIMESTAMPTZ;
