-- Owner 2026-10-06: country partners («Главный партнёр страны») and their
-- monthly settlements (paid through payroll).
CREATE TABLE "country_partners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_code" CHAR(2) NOT NULL,
    "name" STRING(120) NOT NULL,
    "contact" STRING(200),
    "lead_admin_id" UUID NOT NULL,
    "share_bps" INT4 NOT NULL,
    "status" STRING(16) NOT NULL DEFAULT 'active',
    "max_admins" INT4 NOT NULL DEFAULT 10,
    "payouts_enabled" BOOL NOT NULL DEFAULT false,
    "payroll_employee_id" UUID,
    "contract_starts_at" TIMESTAMPTZ,
    "contract_ends_at" TIMESTAMPTZ,
    "contract_version" INT4,
    "contract_accepted_at" TIMESTAMPTZ,
    "contract_accepted_ip" STRING(64),
    "goals" JSONB NOT NULL DEFAULT '[]',
    "suspended_admin_ids" STRING[] NOT NULL DEFAULT ARRAY[]::STRING[],
    "note" STRING(1000),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "disabled_at" TIMESTAMPTZ,

    CONSTRAINT "country_partners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "country_partners_lead_admin_id_key" ON "country_partners"("lead_admin_id");
CREATE INDEX "country_partners_country_code_status_idx" ON "country_partners"("country_code", "status");

CREATE TABLE "country_partner_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL,
    "period" STRING(7) NOT NULL,
    "currency" STRING(3) NOT NULL DEFAULT 'usd',
    "gross_cents" INT4 NOT NULL,
    "refunds_cents" INT4 NOT NULL DEFAULT 0,
    "fees_cents" INT4 NOT NULL DEFAULT 0,
    "net_cents" INT4 NOT NULL,
    "share_bps" INT4 NOT NULL,
    "amount_cents" INT4 NOT NULL,
    "status" STRING(16) NOT NULL DEFAULT 'held',
    "accrual_ref" STRING(120),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "country_partner_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "country_partner_settlements_partner_id_period_currency_key" ON "country_partner_settlements"("partner_id", "period", "currency");
CREATE INDEX "country_partner_settlements_status_period_idx" ON "country_partner_settlements"("status", "period");

ALTER TABLE "country_partner_settlements" ADD CONSTRAINT "country_partner_settlements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "country_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
