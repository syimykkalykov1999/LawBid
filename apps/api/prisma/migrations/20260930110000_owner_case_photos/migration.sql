-- Owner decision 2026-09-30 (OQ-031): case photos (0-9), private.
ALTER TYPE "file_purpose" ADD VALUE 'case_photo';

CREATE TABLE "case_photos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE RESTRICT,
  "position" INT2 NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "case_photos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_photos_case_id_position_key" ON "case_photos"("case_id", "position");
CREATE INDEX "case_photos_file_id_idx" ON "case_photos"("file_id");
