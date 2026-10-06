-- Owner 2026-10-06: a country partner stops on its own on the contract end
-- date («Договор до»). The daily sweep sets this when it switches the
-- partner off; money earned up to that date is still paid out.
ALTER TABLE "country_partners" ADD COLUMN IF NOT EXISTS "contract_expired_at" TIMESTAMPTZ;
