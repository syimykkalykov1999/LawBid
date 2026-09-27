-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'review_requested';
ALTER TYPE "notification_type" ADD VALUE 'review_received';

-- AlterTable
ALTER TABLE "attorney_licenses" ADD COLUMN     "rejection_code" STRING;
ALTER TABLE "attorney_licenses" ADD COLUMN     "rejection_note" STRING;

-- AlterTable
ALTER TABLE "attorney_profiles" ADD COLUMN     "username_changed_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "edited_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "verification_documents" ADD COLUMN     "side" STRING;

-- AlterTable
ALTER TABLE "verification_requests" ADD COLUMN     "applicant_comment" STRING;
ALTER TABLE "verification_requests" ADD COLUMN     "info_request_message" STRING;
ALTER TABLE "verification_requests" ADD COLUMN     "rejection_code" STRING;


-- docs/03_VERIFICATION_PROFILES.md §10: applicant comment up to 500 chars;
-- side is front | back. verification_documents(request_id) already
-- exists (stage 2.3).
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_applicant_comment_len" CHECK (char_length("applicant_comment") <= 500);
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_side_ck" CHECK ("side" IN ('front', 'back'));
