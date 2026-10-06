-- Owner 2026-10-05 (legal): outreach compliance — do-not-contact flag on
-- leads (TCPA / National Do-Not-Call), the source/consent note, per-lead
-- email counters, and a stop-list of phones/e-mails that must never be
-- contacted again (also fed by the retention job before it deletes a
-- do-not-contact lead).
ALTER TABLE "outreach_leads" ADD COLUMN "do_not_contact_at" TIMESTAMPTZ;
ALTER TABLE "outreach_leads" ADD COLUMN "do_not_contact_reason" STRING(24);
ALTER TABLE "outreach_leads" ADD COLUMN "source_note" STRING(300);
ALTER TABLE "outreach_leads" ADD COLUMN "emails_sent" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "outreach_leads" ADD COLUMN "last_email_at" TIMESTAMPTZ;
CREATE INDEX "outreach_leads_do_not_contact_at_idx" ON "outreach_leads"("do_not_contact_at");

CREATE TABLE "outreach_suppressions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" STRING(8) NOT NULL,
  "value" STRING(254) NOT NULL,
  "note" STRING(200),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "outreach_suppressions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outreach_suppressions_kind_value_key" ON "outreach_suppressions"("kind", "value");
