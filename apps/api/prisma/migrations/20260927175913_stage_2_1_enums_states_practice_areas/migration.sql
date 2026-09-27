-- CreateEnum
CREATE TYPE "file_purpose" AS ENUM ('avatar', 'post_image', 'verification_document', 'verification_selfie');

-- CreateEnum
CREATE TYPE "scan_status" AS ENUM ('pending', 'clean', 'infected', 'failed');

-- CreateEnum
CREATE TYPE "contact_method" AS ENUM ('call', 'sms', 'email', 'in_app_chat');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('unverified', 'pending', 'verified', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "license_status" AS ENUM ('pending', 'verified', 'rejected', 'expired', 'suspended');

-- CreateEnum
CREATE TYPE "verification_request_status" AS ENUM ('draft', 'submitted', 'in_review', 'needs_more_info', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "verification_doc_type" AS ENUM ('bar_license', 'drivers_license', 'passport', 'state_id', 'selfie', 'other');

-- CreateEnum
CREATE TYPE "verification_provider" AS ENUM ('manual', 'stripe_identity', 'persona');

-- CreateEnum
CREATE TYPE "verification_check_type" AS ENUM ('bar_lookup', 'id_check', 'face_match');

-- CreateEnum
CREATE TYPE "check_result" AS ENUM ('pass', 'fail', 'manual_review');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('open', 'in_progress', 'pending_completion', 'disputed', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "budget_mode" AS ENUM ('amount', 'clarify_later');

-- CreateEnum
CREATE TYPE "bid_status" AS ENUM ('active', 'accepted', 'rejected_by_client', 'rejected_auto', 'withdrawn', 'failed_negotiation');

-- CreateEnum
CREATE TYPE "fee_type" AS ENUM ('fixed', 'hourly', 'free_consultation');

-- CreateEnum
CREATE TYPE "start_availability" AS ENUM ('immediately', 'within_week', 'custom_date');

-- CreateEnum
CREATE TYPE "party_role" AS ENUM ('client', 'attorney');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('pending', 'accepted', 'declined', 'countered', 'superseded');

-- CreateEnum
CREATE TYPE "case_journal_event" AS ENUM ('created', 'updated', 'bid_placed', 'offer_made', 'bid_accepted', 'bid_rejected', 'bid_withdrawn', 'negotiation_failed', 'contacts_disclosed', 'completion_requested', 'completion_confirmed', 'auto_closed', 'disputed', 'dispute_resolved', 'archived', 'restored', 'deleted', 'closed');

-- CreateEnum
CREATE TYPE "contact_issue_type" AS ENUM ('phone_invalid', 'no_answer', 'email_bounce', 'wrong_person', 'other');

-- CreateEnum
CREATE TYPE "contact_issue_status" AS ENUM ('open', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "dispute_status" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('published', 'hidden', 'removed');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('published', 'hidden', 'removed');

-- CreateEnum
CREATE TYPE "saved_item_type" AS ENUM ('post', 'case');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "conversation_status" AS ENUM ('pre_acceptance', 'active', 'closed');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('text', 'system');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('bid_received', 'offer_countered', 'offer_accepted', 'bid_accepted', 'bid_rejected', 'negotiation_failed', 'case_stale_prompt', 'case_archived', 'completion_requested', 'completion_reminder', 'case_closed', 'new_message', 'new_follower', 'post_like', 'post_comment', 'comment_reply', 'comment_like', 'verification_update', 'subscription_trial_ending', 'subscription_payment_failed', 'subscription_status', 'contact_issue_update', 'moderation_notice', 'security_new_device');

-- CreateEnum
CREATE TYPE "notification_category" AS ENUM ('messages', 'bids', 'cases', 'social', 'system', 'marketing');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'expired');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "report_target_type" AS ENUM ('post', 'comment', 'user', 'message', 'case', 'review');

-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('spam', 'abuse', 'misinformation', 'impersonation', 'inappropriate', 'other');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'actioned', 'dismissed');

-- CreateEnum
CREATE TYPE "moderation_action_type" AS ENUM ('hide', 'remove', 'warn', 'suspend', 'restore');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('super_admin', 'moderator', 'verifier', 'support', 'finance');

-- CreateEnum
CREATE TYPE "data_request_type" AS ENUM ('subpoena', 'court_order');

-- CreateEnum
CREATE TYPE "data_request_status" AS ENUM ('received', 'in_progress', 'fulfilled', 'rejected');

-- CreateTable
CREATE TABLE "states" (
    "code" CHAR(2) NOT NULL,
    "name" STRING NOT NULL,
    "is_active" BOOL NOT NULL DEFAULT true,

    CONSTRAINT "states_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "practice_areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "code" STRING NOT NULL,
    "name_en" STRING NOT NULL,
    "i18n_key" STRING NOT NULL,
    "sort" INT4 NOT NULL,
    "is_active" BOOL NOT NULL DEFAULT true,

    CONSTRAINT "practice_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_areas_code_key" ON "practice_areas"("code");

-- CreateIndex
CREATE INDEX "practice_areas_parent_id_idx" ON "practice_areas"("parent_id");

-- AddForeignKey
ALTER TABLE "practice_areas" ADD CONSTRAINT "practice_areas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "practice_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
