SET LOCAL lock_timeout = '5s';
-- Item 25, PR 4 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §5, §6, §4):
-- encrypted chat files and backups (two file purposes: the server keeps
-- only ciphertext), message franking (the tag a report is checked
-- against), the backup pointer and the evidence a report carries. Expand
-- only: enum values, a nullable column, two new tables.
ALTER TYPE "file_purpose" ADD VALUE IF NOT EXISTS 'chat_e2ee';
ALTER TYPE "file_purpose" ADD VALUE IF NOT EXISTS 'chat_backup_e2ee';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "franking_tag" BYTEA;

-- CreateTable
CREATE TABLE "e2ee_backups" (
    "user_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "e2ee_backups_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "e2ee_report_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID,
    "body" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "e2ee_report_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "e2ee_report_evidence_report_id_idx" ON "e2ee_report_evidence"("report_id");

-- AddForeignKey
ALTER TABLE "e2ee_backups" ADD CONSTRAINT "e2ee_backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "e2ee_report_evidence" ADD CONSTRAINT "e2ee_report_evidence_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

