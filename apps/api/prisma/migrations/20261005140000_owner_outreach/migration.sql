-- Owner 2026-10-05: outreach (Привлечение) — leads, activities, templates.
CREATE TABLE "outreach_leads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" STRING(10) NOT NULL DEFAULT 'attorney',
  "first_name" STRING(80),
  "last_name" STRING(80),
  "company" STRING(160),
  "state_code" STRING(2),
  "city" STRING(80),
  "practice" STRING(80),
  "phone" STRING(20),
  "email" STRING(254),
  "source" STRING(20) NOT NULL DEFAULT 'manual',
  "source_ref" STRING(64),
  "status" STRING(16) NOT NULL DEFAULT 'new',
  "partner_id" UUID,
  "converted_user_id" UUID,
  "unsubscribe_token" STRING(48) NOT NULL,
  "unsubscribed_at" TIMESTAMPTZ,
  "last_activity_at" TIMESTAMPTZ,
  "next_action_at" TIMESTAMPTZ,
  "note" STRING(2000),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "outreach_leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outreach_leads_phone_key" ON "outreach_leads"("phone");
CREATE UNIQUE INDEX "outreach_leads_email_key" ON "outreach_leads"("email");
CREATE UNIQUE INDEX "outreach_leads_unsubscribe_token_key" ON "outreach_leads"("unsubscribe_token");
CREATE INDEX "outreach_leads_partner_id_status_created_at_idx" ON "outreach_leads"("partner_id", "status", "created_at");
CREATE INDEX "outreach_leads_status_created_at_idx" ON "outreach_leads"("status", "created_at");
CREATE INDEX "outreach_leads_state_code_kind_idx" ON "outreach_leads"("state_code", "kind");
CREATE INDEX "outreach_leads_converted_user_id_idx" ON "outreach_leads"("converted_user_id");
CREATE INDEX "outreach_leads_next_action_at_idx" ON "outreach_leads"("next_action_at");
ALTER TABLE "outreach_leads" ADD CONSTRAINT "outreach_leads_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "outreach_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" UUID NOT NULL,
  "partner_id" UUID,
  "actor_admin_id" UUID,
  "kind" STRING(12) NOT NULL,
  "outcome" STRING(24),
  "body" STRING(4000),
  "meta" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "outreach_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outreach_activities_lead_id_created_at_idx" ON "outreach_activities"("lead_id", "created_at");
CREATE INDEX "outreach_activities_partner_id_kind_created_at_idx" ON "outreach_activities"("partner_id", "kind", "created_at");
CREATE INDEX "outreach_activities_created_at_idx" ON "outreach_activities"("created_at");
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "outreach_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "outreach_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" STRING(80) NOT NULL,
  "kind" STRING(10) NOT NULL DEFAULT 'any',
  "subject" STRING(200) NOT NULL,
  "body" STRING(8000) NOT NULL,
  "active" BOOL NOT NULL DEFAULT true,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "outreach_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outreach_templates_active_kind_idx" ON "outreach_templates"("active", "kind");
