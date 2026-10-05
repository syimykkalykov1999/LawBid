-- Owner 2026-10-05: attorney trust levels. The simple sign-up stays (state +
-- bar number + sworn statement), but what LawBid shows to clients and what
-- the attorney may do (bids, receiving money, the blue check) now follow a
-- computed level: 0 self-attested, 1 license confirmed by the state
-- registry or a verifier, 2 identity confirmed (Stripe KYC with a matching
-- legal name, or staff-checked documents), 3 both. Holds (a client's fraud
-- complaint, a name mismatch, a duplicate bar-number claim) close the
-- payment and bid gates whatever the level, until a verifier looks.

ALTER TABLE "attorney_profiles" ADD COLUMN IF NOT EXISTS "trust_level" INT2 NOT NULL DEFAULT 0;
ALTER TABLE "attorney_profiles" ADD COLUMN IF NOT EXISTS "trust_badge" BOOL NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "attorney_trust" (
    "attorney_id" UUID NOT NULL,
    "level" INT2 NOT NULL DEFAULT 0,
    "license_confirmed_at" TIMESTAMPTZ,
    "license_confirmed_by" STRING(16),
    "license_confirmed_note" STRING(500),
    "documents_verified_at" TIMESTAMPTZ,
    "documents_verified_by" UUID,
    "stripe_kyc_at" TIMESTAMPTZ,
    "stripe_charges_enabled" BOOL NOT NULL DEFAULT false,
    "stripe_legal_name" STRING(200),
    "stripe_business_type" STRING(24),
    "stripe_company_name" STRING(200),
    "stripe_company_domain" STRING(200),
    "stripe_representative" STRING(200),
    "name_check" STRING(16) NOT NULL DEFAULT 'unknown',
    "name_checked_at" TIMESTAMPTZ,
    "firm_link_status" STRING(16) NOT NULL DEFAULT 'none',
    "firm_link_source" STRING(16),
    "firm_link_at" TIMESTAMPTZ,
    "firm_link_note" STRING(500),
    "firm_email_domain" STRING(200),
    "firm_email_verified_at" TIMESTAMPTZ,
    "payments_hold" STRING(32),
    "payments_hold_at" TIMESTAMPTZ,
    "bids_hold" STRING(32),
    "bids_hold_at" TIMESTAMPTZ,
    "hold_note" STRING(500),
    "complaints_total" INT4 NOT NULL DEFAULT 0,
    "duplicate_claims" INT4 NOT NULL DEFAULT 0,
    "payout_delay_days" INT2,
    "payout_delay_synced_at" TIMESTAMPTZ,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attorney_trust_pkey" PRIMARY KEY ("attorney_id")
);

CREATE INDEX IF NOT EXISTS "attorney_trust_level_idx" ON "attorney_trust"("level");
CREATE INDEX IF NOT EXISTS "attorney_trust_payments_hold_idx" ON "attorney_trust"("payments_hold");
CREATE INDEX IF NOT EXISTS "attorney_trust_bids_hold_idx" ON "attorney_trust"("bids_hold");

ALTER TABLE "attorney_trust" ADD CONSTRAINT "attorney_trust_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "attorney_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "attorney_trust_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attorney_id" UUID NOT NULL,
    "kind" STRING(48) NOT NULL,
    "from_level" INT2,
    "to_level" INT2,
    "actor_type" STRING(16) NOT NULL DEFAULT 'system',
    "actor_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attorney_trust_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attorney_trust_events_attorney_id_created_at_idx" ON "attorney_trust_events"("attorney_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "attorney_trust_events_kind_created_at_idx" ON "attorney_trust_events"("kind", "created_at" DESC);

ALTER TABLE "attorney_trust_events" ADD CONSTRAINT "attorney_trust_events_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "attorney_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
