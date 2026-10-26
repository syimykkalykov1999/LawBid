-- 2026-10-25 (legal register): 18+ attestation (COPPA), separate SMS consent
-- + STOP/START suppression (TCPA), e-mail suppression fed by SES bounces and
-- complaints (CAN-SPAM, Gmail/Yahoo bulk-sender rules). Additive only.
CREATE TABLE "age_attestations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "attested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text_version" VARCHAR(40) NOT NULL,
    "min_age" SMALLINT NOT NULL,
    "birth_date" DATE,
    "source" VARCHAR(16) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'attested',
    "flagged_at" TIMESTAMPTZ,
    "flagged_by" UUID,
    "flag_reason" VARCHAR(200),
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "age_attestations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "age_attestations_user_id_key" ON "age_attestations"("user_id");
CREATE INDEX "age_attestations_status_flagged_at_idx" ON "age_attestations"("status", "flagged_at");

CREATE TABLE "sms_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "phone_e164" VARCHAR(20) NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "disclosure_version" VARCHAR(40) NOT NULL,
    "disclosure_hash" VARCHAR(64) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "revoked_via" VARCHAR(16),
    CONSTRAINT "sms_consents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sms_consents_phone_e164_purpose_idx" ON "sms_consents"("phone_e164", "purpose");
CREATE INDEX "sms_consents_user_id_idx" ON "sms_consents"("user_id");

CREATE TABLE "sms_suppressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_e164" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(16) NOT NULL,
    "last_keyword" VARCHAR(24),
    "last_message_sid" VARCHAR(40),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at" TIMESTAMPTZ,
    CONSTRAINT "sms_suppressions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sms_suppressions_phone_e164_key" ON "sms_suppressions"("phone_e164");

CREATE TABLE "email_suppressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "reason" VARCHAR(16) NOT NULL,
    "detail" VARCHAR(80),
    "message_id" VARCHAR(80),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_suppressions_email_key" ON "email_suppressions"("email");
