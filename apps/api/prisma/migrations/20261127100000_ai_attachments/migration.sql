SET LOCAL lock_timeout = '5s';
-- Owner 2026-11-12 (row 48): screenshots and photos for the AI technician and
-- the AI employee. Expand-only: one enum value and one new table nobody else
-- reads. The bytes live in `files` (purpose ai_attachment, private bucket).
ALTER TYPE "file_purpose" ADD VALUE IF NOT EXISTS 'ai_attachment';

CREATE TABLE "ai_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "issue_number" INTEGER,
    "role_id" UUID,
    "run_item_id" UUID,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_attachments_kind_issue_number_idx" ON "ai_attachments"("kind", "issue_number");
CREATE INDEX "ai_attachments_role_id_idx" ON "ai_attachments"("role_id");
CREATE INDEX "ai_attachments_run_item_id_idx" ON "ai_attachments"("run_item_id");
CREATE INDEX "ai_attachments_closed_at_idx" ON "ai_attachments"("closed_at");
CREATE INDEX "ai_attachments_file_id_idx" ON "ai_attachments"("file_id");

ALTER TABLE "ai_attachments" ADD CONSTRAINT "ai_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_attachments" ADD CONSTRAINT "ai_attachments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "ai_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
