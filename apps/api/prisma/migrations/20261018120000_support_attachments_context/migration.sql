-- Owner 2026-10-18 (OQ-055): support attachments, device context, macros per language.
ALTER TYPE "file_purpose" ADD VALUE IF NOT EXISTS 'support_attachment';

ALTER TABLE "support_tickets" ADD COLUMN "client_context" JSONB;
ALTER TABLE "support_macros" ADD COLUMN "body_ru" VARCHAR(5000);

CREATE TABLE "support_message_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_message_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_message_files_file_id_key" ON "support_message_files"("file_id");
CREATE INDEX "support_message_files_message_id_position_idx" ON "support_message_files"("message_id", "position");
ALTER TABLE "support_message_files" ADD CONSTRAINT "support_message_files_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "support_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_message_files" ADD CONSTRAINT "support_message_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
