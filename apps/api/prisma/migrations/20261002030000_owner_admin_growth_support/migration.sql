-- Owner 2026-10-02: admin growth & support tools — contract (blogger)
-- subscriptions, promo codes + redemptions, refunds, referrals, paid case
-- promotion, support tickets, email template overrides. Status/kind
-- columns are short strings (validated by the API, CHECKs below).
-- CreateTable
CREATE TABLE "contract_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "months" INT2 NOT NULL,
    "assistant_seats" INT2 NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "contract_ref" STRING(200),
    "note" STRING(1000),
    "created_by" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by" UUID,
    "revoke_reason" STRING(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contract_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" STRING(40) NOT NULL,
    "description" STRING(300),
    "discount_type" STRING(16) NOT NULL,
    "percent_off" INT2,
    "amount_off_cents" INT4,
    "free_days" INT4,
    "audience" STRING(16) NOT NULL DEFAULT 'attorney',
    "applies_to" STRING(16) NOT NULL DEFAULT 'any',
    "max_redemptions" INT4,
    "redeemed_count" INT4 NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "active" BOOL NOT NULL DEFAULT true,
    "stripe_coupon_id" STRING,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "promo_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_off_cents" INT4,
    "payment_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_cents" INT4 NOT NULL,
    "reason" STRING(500) NOT NULL,
    "status" STRING(16) NOT NULL,
    "stripe_refund_id" STRING,
    "failure_reason" STRING,
    "admin_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code" STRING(24) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "referrer_id" UUID NOT NULL,
    "referee_id" UUID NOT NULL,
    "code" STRING(24) NOT NULL,
    "status" STRING(16) NOT NULL DEFAULT 'pending',
    "referrer_role" STRING(16) NOT NULL,
    "referee_role" STRING(16) NOT NULL,
    "referrer_reward" JSONB NOT NULL DEFAULT '{}',
    "referee_reward" JSONB NOT NULL DEFAULT '{}',
    "qualified_at" TIMESTAMPTZ,
    "rewarded_at" TIMESTAMPTZ,
    "rejected_reason" STRING(300),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "days" INT2 NOT NULL,
    "price_cents_per_day" INT4 NOT NULL,
    "total_cents" INT4 NOT NULL,
    "status" STRING(20) NOT NULL,
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "stripe_checkout_id" STRING,
    "payment_id" UUID,
    "promo_code_id" UUID,
    "granted_by" UUID,
    "canceled_by" UUID,
    "cancel_reason" STRING(500),
    "impressions" INT4 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "case_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "subject" STRING(200) NOT NULL,
    "category" STRING(20) NOT NULL DEFAULT 'other',
    "status" STRING(16) NOT NULL DEFAULT 'open',
    "priority" STRING(8) NOT NULL DEFAULT 'normal',
    "assignee_id" UUID,
    "unread_by_admin" BOOL NOT NULL DEFAULT true,
    "unread_by_user" BOOL NOT NULL DEFAULT false,
    "last_message_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID,
    "author_admin_id" UUID,
    "internal" BOOL NOT NULL DEFAULT false,
    "body" STRING(5000) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "key" STRING(64) NOT NULL,
    "locale" STRING(5) NOT NULL,
    "subject" STRING(200) NOT NULL,
    "text_body" STRING NOT NULL,
    "html_body" STRING,
    "enabled" BOOL NOT NULL DEFAULT true,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("key","locale")
);

-- CreateIndex
CREATE INDEX "contract_grants_user_id_ends_at_idx" ON "contract_grants"("user_id", "ends_at");

-- CreateIndex
CREATE INDEX "contract_grants_ends_at_idx" ON "contract_grants"("ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_active_expires_at_idx" ON "promo_codes"("active", "expires_at");

-- CreateIndex
CREATE INDEX "promo_redemptions_user_id_idx" ON "promo_redemptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_promo_id_user_id_key" ON "promo_redemptions"("promo_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_stripe_refund_id_key" ON "refunds"("stripe_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_created_at_idx" ON "refunds"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_user_id_key" ON "referral_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referee_id_key" ON "referrals"("referee_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_created_at_idx" ON "referrals"("referrer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "referrals_status_created_at_idx" ON "referrals"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_promotions_stripe_checkout_id_key" ON "case_promotions"("stripe_checkout_id");

-- CreateIndex
CREATE INDEX "case_promotions_status_ends_at_idx" ON "case_promotions"("status", "ends_at");

-- CreateIndex
CREATE INDEX "case_promotions_case_id_idx" ON "case_promotions"("case_id");

-- CreateIndex
CREATE INDEX "case_promotions_user_id_created_at_idx" ON "case_promotions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "support_tickets_status_last_message_at_idx" ON "support_tickets"("status", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "support_tickets_user_id_last_message_at_idx" ON "support_tickets"("user_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "support_tickets_assignee_id_status_idx" ON "support_tickets"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");


-- Value guards (the DTOs validate too).
ALTER TABLE "contract_grants" ADD CONSTRAINT "contract_grants_months_check" CHECK ("months" BETWEEN 1 AND 24);
ALTER TABLE "contract_grants" ADD CONSTRAINT "contract_grants_seats_check" CHECK ("assistant_seats" BETWEEN 0 AND 6);
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_type_check" CHECK ("discount_type" IN ('percent', 'amount', 'free_days'));
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_percent_check" CHECK ("percent_off" IS NULL OR "percent_off" BETWEEN 1 AND 100);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK ("status" IN ('pending', 'succeeded', 'failed'));
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_status_check" CHECK ("status" IN ('pending', 'qualified', 'rewarded', 'rejected'));
ALTER TABLE "case_promotions" ADD CONSTRAINT "case_promotions_status_check" CHECK ("status" IN ('pending_payment', 'active', 'finished', 'canceled', 'refunded'));
ALTER TABLE "case_promotions" ADD CONSTRAINT "case_promotions_days_check" CHECK ("days" BETWEEN 1 AND 90);
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_status_check" CHECK ("status" IN ('open', 'waiting_user', 'resolved', 'closed'));
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
