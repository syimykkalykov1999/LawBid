-- Owner 2026-10-20 (case tools): time and expenses, invoices (documents only),
-- e-signature requests, form-built documents, conflict-of-interest checks.
-- CreateEnum
CREATE TYPE "case_sign_status" AS ENUM ('pending', 'signed', 'declined', 'canceled');

-- CreateTable
CREATE TABLE "case_billing" (
    "case_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "hourly_rate_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_billing_pkey" PRIMARY KEY ("case_id")
);

-- CreateTable
CREATE TABLE "case_time_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "worked_on" DATE NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "running_since" TIMESTAMPTZ,
    "note" VARCHAR(300) NOT NULL DEFAULT '',
    "rate_cents" INTEGER NOT NULL,
    "invoice_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "case_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "spent_on" DATE NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "receipt_file_id" UUID,
    "invoice_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "case_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "minutes" INTEGER NOT NULL,
    "time_cents" INTEGER NOT NULL,
    "expenses_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "lines" JSONB NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_sign_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "source_file_id" UUID NOT NULL,
    "source_sha256" VARCHAR(64) NOT NULL,
    "status" "case_sign_status" NOT NULL DEFAULT 'pending',
    "final_file_id" UUID,
    "final_sha256" VARCHAR(64),
    "declined_by" UUID,
    "decline_reason" VARCHAR(300),
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_sign_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_signatures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "signer_id" UUID NOT NULL,
    "signer_role" VARCHAR(16) NOT NULL,
    "signed_name" VARCHAR(120) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "image_png" BYTEA,
    "doc_sha256" VARCHAR(64) NOT NULL,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "signed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(64) NOT NULL,
    "title" JSONB NOT NULL DEFAULT '{}',
    "description" JSONB NOT NULL DEFAULT '{}',
    "body" JSONB NOT NULL DEFAULT '{}',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "practice_area_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_conflict_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "trigger" VARCHAR(8) NOT NULL,
    "bid_id" UUID,
    "matches" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_conflict_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_time_entries_case_id_worked_on_idx" ON "case_time_entries"("case_id", "worked_on");

-- CreateIndex
CREATE INDEX "case_time_entries_attorney_id_running_since_idx" ON "case_time_entries"("attorney_id", "running_since");

-- CreateIndex
CREATE INDEX "case_expenses_case_id_spent_on_idx" ON "case_expenses"("case_id", "spent_on");

-- CreateIndex
CREATE INDEX "case_invoices_attorney_id_created_at_idx" ON "case_invoices"("attorney_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_invoices_case_id_seq_key" ON "case_invoices"("case_id", "seq");

-- CreateIndex
CREATE INDEX "case_sign_requests_case_id_created_at_idx" ON "case_sign_requests"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_signatures_request_id_signer_id_key" ON "case_signatures"("request_id", "signer_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_slug_key" ON "form_templates"("slug");

-- CreateIndex
CREATE INDEX "form_templates_is_published_deleted_at_position_idx" ON "form_templates"("is_published", "deleted_at", "position");

-- CreateIndex
CREATE INDEX "case_conflict_checks_attorney_id_created_at_idx" ON "case_conflict_checks"("attorney_id", "created_at");

-- CreateIndex
CREATE INDEX "case_conflict_checks_case_id_attorney_id_idx" ON "case_conflict_checks"("case_id", "attorney_id");

-- AddForeignKey
ALTER TABLE "case_time_entries" ADD CONSTRAINT "case_time_entries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_expenses" ADD CONSTRAINT "case_expenses_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_expenses" ADD CONSTRAINT "case_expenses_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_invoices" ADD CONSTRAINT "case_invoices_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_sign_requests" ADD CONSTRAINT "case_sign_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_signatures" ADD CONSTRAINT "case_signatures_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "case_sign_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One running timer per attorney, whatever the case.
CREATE UNIQUE INDEX "case_time_entries_one_running_uq"
  ON "case_time_entries"("attorney_id") WHERE "running_since" IS NOT NULL AND "deleted_at" IS NULL;

ALTER TABLE "case_billing" ADD CONSTRAINT "case_billing_rate_chk"
  CHECK ("hourly_rate_cents" BETWEEN 0 AND 10000000);
ALTER TABLE "case_time_entries" ADD CONSTRAINT "case_time_entries_minutes_chk"
  CHECK ("minutes" BETWEEN 0 AND 1440 AND "rate_cents" BETWEEN 0 AND 10000000);
ALTER TABLE "case_expenses" ADD CONSTRAINT "case_expenses_amount_chk"
  CHECK ("amount_cents" BETWEEN 1 AND 100000000);
ALTER TABLE "case_signatures" ADD CONSTRAINT "case_signatures_method_chk"
  CHECK ("method" IN ('drawn', 'typed') AND "signer_role" IN ('client', 'attorney'));
