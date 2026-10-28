-- ID selfie camera 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md):
-- how a selfie was captured (liveness result, timings, device, capture token
-- check) is stored with the document for the verifier.
-- Expand-only: a nullable jsonb column with no default is a metadata-only
-- change in PostgreSQL (no table rewrite); the running release ignores it.
SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "verification_documents" ADD COLUMN "capture_meta" JSONB;
