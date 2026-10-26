-- Shard-ready steps 3 and 4 (docs/architecture/SHARDING_READY.md §5, §7).
-- Expand-only, no behaviour change.
--
-- Part 1: shard_map, the routing table (logical shard 0..255 -> physical
-- database key). Global family, lives on the primary DB. Every shard maps
-- to 'primary' until a second database exists; the application treats a
-- missing row as 'primary' too.
CREATE TABLE IF NOT EXISTS "shard_map" (
    "logical_shard" SMALLINT NOT NULL,
    "physical_db" TEXT NOT NULL DEFAULT 'primary',
    "state" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shard_map_pkey" PRIMARY KEY ("logical_shard"),
    CONSTRAINT "shard_map_range" CHECK ("logical_shard" BETWEEN 0 AND 255)
);

INSERT INTO "shard_map" ("logical_shard", "physical_db")
SELECT s, 'primary' FROM generate_series(0, 255) AS s
ON CONFLICT ("logical_shard") DO NOTHING;

-- Part 2: BEFORE INSERT trigger that fills shard_id for rows the
-- application did not stamp (shard_id still 0): nested relation creates
-- (`data: { children: { create } }`) and raw SQL inserts. Same rule as
-- src/sharding/shard.extension.ts and the step-2 backfill:
--   owner key  -> the LAST byte of the owner's uuid
--   parent key -> the parent's shard_id (children inherit), keys tried in
--                 the order of the manifest
-- No key found (NULL columns, parent not visible) -> shard_id stays 0.
-- The WHEN clause keeps the function off every row the application already
-- stamped. Arguments per key: kind, column, parent table.
-- The trigger list is generated from src/sharding/shard-manifest.ts by
-- scripts/generate-shard-trigger-migration.ts (spec: shard-trigger-migration).
CREATE OR REPLACE FUNCTION lawbid_shard_fill() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  i integer := 0;
  val text;
  found_shard smallint;
BEGIN
  WHILE i + 2 < TG_NARGS LOOP
    val := to_jsonb(NEW) ->> TG_ARGV[i + 1];
    IF val IS NOT NULL THEN
      IF TG_ARGV[i] = 'owner' THEN
        NEW.shard_id := get_byte(uuid_send(val::uuid), 15);
        RETURN NEW;
      END IF;
      EXECUTE format('SELECT shard_id FROM %I WHERE id = $1', TG_ARGV[i + 2])
        INTO found_shard USING val::uuid;
      IF found_shard IS NOT NULL THEN
        NEW.shard_id := found_shard;
        RETURN NEW;
      END IF;
    END IF;
    i := i + 3;
  END LOOP;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS "attorney_task_people_shard_fill" ON "attorney_task_people";
CREATE TRIGGER "attorney_task_people_shard_fill" BEFORE INSERT ON "attorney_task_people" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'task_id', 'attorney_tasks');
DROP TRIGGER IF EXISTS "attorney_task_places_shard_fill" ON "attorney_task_places";
CREATE TRIGGER "attorney_task_places_shard_fill" BEFORE INSERT ON "attorney_task_places" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'task_id', 'attorney_tasks');
DROP TRIGGER IF EXISTS "attorney_task_steps_shard_fill" ON "attorney_task_steps";
CREATE TRIGGER "attorney_task_steps_shard_fill" BEFORE INSERT ON "attorney_task_steps" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'task_id', 'attorney_tasks');
DROP TRIGGER IF EXISTS "attorney_tasks_shard_fill" ON "attorney_tasks";
CREATE TRIGGER "attorney_tasks_shard_fill" BEFORE INSERT ON "attorney_tasks" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'attorney_id', '');
DROP TRIGGER IF EXISTS "bid_drafts_shard_fill" ON "bid_drafts";
CREATE TRIGGER "bid_drafts_shard_fill" BEFORE INSERT ON "bid_drafts" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "bid_offers_shard_fill" ON "bid_offers";
CREATE TRIGGER "bid_offers_shard_fill" BEFORE INSERT ON "bid_offers" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'bid_id', 'bids');
DROP TRIGGER IF EXISTS "bids_shard_fill" ON "bids";
CREATE TRIGGER "bids_shard_fill" BEFORE INSERT ON "bids" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "call_log_hidden_shard_fill" ON "call_log_hidden";
CREATE TRIGGER "call_log_hidden_shard_fill" BEFORE INSERT ON "call_log_hidden" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "call_participants_shard_fill" ON "call_participants";
CREATE TRIGGER "call_participants_shard_fill" BEFORE INSERT ON "call_participants" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'call_id', 'calls');
DROP TRIGGER IF EXISTS "call_votes_shard_fill" ON "call_votes";
CREATE TRIGGER "call_votes_shard_fill" BEFORE INSERT ON "call_votes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'call_id', 'calls');
DROP TRIGGER IF EXISTS "calls_shard_fill" ON "calls";
CREATE TRIGGER "calls_shard_fill" BEFORE INSERT ON "calls" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations', 'owner', 'caller_id', '');
DROP TRIGGER IF EXISTS "case_billing_shard_fill" ON "case_billing";
CREATE TRIGGER "case_billing_shard_fill" BEFORE INSERT ON "case_billing" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_comment_likes_shard_fill" ON "case_comment_likes";
CREATE TRIGGER "case_comment_likes_shard_fill" BEFORE INSERT ON "case_comment_likes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'comment_id', 'case_comments');
DROP TRIGGER IF EXISTS "case_comments_shard_fill" ON "case_comments";
CREATE TRIGGER "case_comments_shard_fill" BEFORE INSERT ON "case_comments" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_conflict_checks_shard_fill" ON "case_conflict_checks";
CREATE TRIGGER "case_conflict_checks_shard_fill" BEFORE INSERT ON "case_conflict_checks" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_disputes_shard_fill" ON "case_disputes";
CREATE TRIGGER "case_disputes_shard_fill" BEFORE INSERT ON "case_disputes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_expenses_shard_fill" ON "case_expenses";
CREATE TRIGGER "case_expenses_shard_fill" BEFORE INSERT ON "case_expenses" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_extra_practices_shard_fill" ON "case_extra_practices";
CREATE TRIGGER "case_extra_practices_shard_fill" BEFORE INSERT ON "case_extra_practices" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_invites_shard_fill" ON "case_invites";
CREATE TRIGGER "case_invites_shard_fill" BEFORE INSERT ON "case_invites" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_invoices_shard_fill" ON "case_invoices";
CREATE TRIGGER "case_invoices_shard_fill" BEFORE INSERT ON "case_invoices" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_journal_shard_fill" ON "case_journal";
CREATE TRIGGER "case_journal_shard_fill" BEFORE INSERT ON "case_journal" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_payment_refunds_shard_fill" ON "case_payment_refunds";
CREATE TRIGGER "case_payment_refunds_shard_fill" BEFORE INSERT ON "case_payment_refunds" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'payment_id', 'case_payments');
DROP TRIGGER IF EXISTS "case_payments_shard_fill" ON "case_payments";
CREATE TRIGGER "case_payments_shard_fill" BEFORE INSERT ON "case_payments" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_photos_shard_fill" ON "case_photos";
CREATE TRIGGER "case_photos_shard_fill" BEFORE INSERT ON "case_photos" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_reads_shard_fill" ON "case_reads";
CREATE TRIGGER "case_reads_shard_fill" BEFORE INSERT ON "case_reads" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_shares_shard_fill" ON "case_shares";
CREATE TRIGGER "case_shares_shard_fill" BEFORE INSERT ON "case_shares" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_sign_requests_shard_fill" ON "case_sign_requests";
CREATE TRIGGER "case_sign_requests_shard_fill" BEFORE INSERT ON "case_sign_requests" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_signatures_shard_fill" ON "case_signatures";
CREATE TRIGGER "case_signatures_shard_fill" BEFORE INSERT ON "case_signatures" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'request_id', 'case_sign_requests');
DROP TRIGGER IF EXISTS "case_states_shard_fill" ON "case_states";
CREATE TRIGGER "case_states_shard_fill" BEFORE INSERT ON "case_states" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_task_events_shard_fill" ON "case_task_events";
CREATE TRIGGER "case_task_events_shard_fill" BEFORE INSERT ON "case_task_events" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_task_items_shard_fill" ON "case_task_items";
CREATE TRIGGER "case_task_items_shard_fill" BEFORE INSERT ON "case_task_items" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'task_id', 'case_tasks');
DROP TRIGGER IF EXISTS "case_tasks_shard_fill" ON "case_tasks";
CREATE TRIGGER "case_tasks_shard_fill" BEFORE INSERT ON "case_tasks" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_time_entries_shard_fill" ON "case_time_entries";
CREATE TRIGGER "case_time_entries_shard_fill" BEFORE INSERT ON "case_time_entries" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "case_updates_shard_fill" ON "case_updates";
CREATE TRIGGER "case_updates_shard_fill" BEFORE INSERT ON "case_updates" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "cases_shard_fill" ON "cases";
CREATE TRIGGER "cases_shard_fill" BEFORE INSERT ON "cases" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'client_id', '');
DROP TRIGGER IF EXISTS "channel_admins_shard_fill" ON "channel_admins";
CREATE TRIGGER "channel_admins_shard_fill" BEFORE INSERT ON "channel_admins" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'channel_id', 'channels');
DROP TRIGGER IF EXISTS "channel_comments_shard_fill" ON "channel_comments";
CREATE TRIGGER "channel_comments_shard_fill" BEFORE INSERT ON "channel_comments" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'channel_posts');
DROP TRIGGER IF EXISTS "channel_post_shares_shard_fill" ON "channel_post_shares";
CREATE TRIGGER "channel_post_shares_shard_fill" BEFORE INSERT ON "channel_post_shares" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'channel_posts');
DROP TRIGGER IF EXISTS "channel_post_views_shard_fill" ON "channel_post_views";
CREATE TRIGGER "channel_post_views_shard_fill" BEFORE INSERT ON "channel_post_views" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'channel_posts');
DROP TRIGGER IF EXISTS "channel_posts_shard_fill" ON "channel_posts";
CREATE TRIGGER "channel_posts_shard_fill" BEFORE INSERT ON "channel_posts" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'channel_id', 'channels');
DROP TRIGGER IF EXISTS "channel_reactions_shard_fill" ON "channel_reactions";
CREATE TRIGGER "channel_reactions_shard_fill" BEFORE INSERT ON "channel_reactions" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'channel_posts');
DROP TRIGGER IF EXISTS "channel_subscriptions_shard_fill" ON "channel_subscriptions";
CREATE TRIGGER "channel_subscriptions_shard_fill" BEFORE INSERT ON "channel_subscriptions" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'channel_id', 'channels');
DROP TRIGGER IF EXISTS "channels_shard_fill" ON "channels";
CREATE TRIGGER "channels_shard_fill" BEFORE INSERT ON "channels" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'owner_id', '');
DROP TRIGGER IF EXISTS "chat_group_invites_shard_fill" ON "chat_group_invites";
CREATE TRIGGER "chat_group_invites_shard_fill" BEFORE INSERT ON "chat_group_invites" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
DROP TRIGGER IF EXISTS "chat_group_join_requests_shard_fill" ON "chat_group_join_requests";
CREATE TRIGGER "chat_group_join_requests_shard_fill" BEFORE INSERT ON "chat_group_join_requests" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
DROP TRIGGER IF EXISTS "chat_group_members_shard_fill" ON "chat_group_members";
CREATE TRIGGER "chat_group_members_shard_fill" BEFORE INSERT ON "chat_group_members" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
DROP TRIGGER IF EXISTS "chat_group_messages_shard_fill" ON "chat_group_messages";
CREATE TRIGGER "chat_group_messages_shard_fill" BEFORE INSERT ON "chat_group_messages" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
DROP TRIGGER IF EXISTS "chat_group_poll_options_shard_fill" ON "chat_group_poll_options";
CREATE TRIGGER "chat_group_poll_options_shard_fill" BEFORE INSERT ON "chat_group_poll_options" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'poll_id', 'chat_group_polls');
DROP TRIGGER IF EXISTS "chat_group_poll_votes_shard_fill" ON "chat_group_poll_votes";
CREATE TRIGGER "chat_group_poll_votes_shard_fill" BEFORE INSERT ON "chat_group_poll_votes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'poll_id', 'chat_group_polls');
DROP TRIGGER IF EXISTS "chat_group_polls_shard_fill" ON "chat_group_polls";
CREATE TRIGGER "chat_group_polls_shard_fill" BEFORE INSERT ON "chat_group_polls" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
DROP TRIGGER IF EXISTS "chat_group_topic_reads_shard_fill" ON "chat_group_topic_reads";
CREATE TRIGGER "chat_group_topic_reads_shard_fill" BEFORE INSERT ON "chat_group_topic_reads" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'topic_id', 'chat_group_topics');
DROP TRIGGER IF EXISTS "chat_group_topics_shard_fill" ON "chat_group_topics";
CREATE TRIGGER "chat_group_topics_shard_fill" BEFORE INSERT ON "chat_group_topics" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'group_id', 'chat_groups');
DROP TRIGGER IF EXISTS "chat_groups_shard_fill" ON "chat_groups";
CREATE TRIGGER "chat_groups_shard_fill" BEFORE INSERT ON "chat_groups" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'created_by', '');
DROP TRIGGER IF EXISTS "client_review_appeals_shard_fill" ON "client_review_appeals";
CREATE TRIGGER "client_review_appeals_shard_fill" BEFORE INSERT ON "client_review_appeals" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'review_id', 'client_reviews');
DROP TRIGGER IF EXISTS "client_review_helpful_votes_shard_fill" ON "client_review_helpful_votes";
CREATE TRIGGER "client_review_helpful_votes_shard_fill" BEFORE INSERT ON "client_review_helpful_votes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'review_id', 'client_reviews');
DROP TRIGGER IF EXISTS "client_reviews_shard_fill" ON "client_reviews";
CREATE TRIGGER "client_reviews_shard_fill" BEFORE INSERT ON "client_reviews" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "comment_likes_shard_fill" ON "comment_likes";
CREATE TRIGGER "comment_likes_shard_fill" BEFORE INSERT ON "comment_likes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'comment_id', 'comments');
DROP TRIGGER IF EXISTS "comments_shard_fill" ON "comments";
CREATE TRIGGER "comments_shard_fill" BEFORE INSERT ON "comments" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "consultation_settings_shard_fill" ON "consultation_settings";
CREATE TRIGGER "consultation_settings_shard_fill" BEFORE INSERT ON "consultation_settings" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'attorney_id', '');
DROP TRIGGER IF EXISTS "consultation_time_off_shard_fill" ON "consultation_time_off";
CREATE TRIGGER "consultation_time_off_shard_fill" BEFORE INSERT ON "consultation_time_off" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'attorney_id', '');
DROP TRIGGER IF EXISTS "consultation_windows_shard_fill" ON "consultation_windows";
CREATE TRIGGER "consultation_windows_shard_fill" BEFORE INSERT ON "consultation_windows" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'attorney_id', '');
DROP TRIGGER IF EXISTS "consultations_shard_fill" ON "consultations";
CREATE TRIGGER "consultations_shard_fill" BEFORE INSERT ON "consultations" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases', 'owner', 'client_id', '');
DROP TRIGGER IF EXISTS "contact_book_hashes_shard_fill" ON "contact_book_hashes";
CREATE TRIGGER "contact_book_hashes_shard_fill" BEFORE INSERT ON "contact_book_hashes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'owner_id', '');
DROP TRIGGER IF EXISTS "contact_disclosures_shard_fill" ON "contact_disclosures";
CREATE TRIGGER "contact_disclosures_shard_fill" BEFORE INSERT ON "contact_disclosures" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "contact_issue_reports_shard_fill" ON "contact_issue_reports";
CREATE TRIGGER "contact_issue_reports_shard_fill" BEFORE INSERT ON "contact_issue_reports" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "contact_matches_shard_fill" ON "contact_matches";
CREATE TRIGGER "contact_matches_shard_fill" BEFORE INSERT ON "contact_matches" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'owner_id', '');
DROP TRIGGER IF EXISTS "contact_sync_settings_shard_fill" ON "contact_sync_settings";
CREATE TRIGGER "contact_sync_settings_shard_fill" BEFORE INSERT ON "contact_sync_settings" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "conversation_participants_shard_fill" ON "conversation_participants";
CREATE TRIGGER "conversation_participants_shard_fill" BEFORE INSERT ON "conversation_participants" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
DROP TRIGGER IF EXISTS "conversations_shard_fill" ON "conversations";
CREATE TRIGGER "conversations_shard_fill" BEFORE INSERT ON "conversations" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases', 'owner', 'client_id', '');
DROP TRIGGER IF EXISTS "follows_shard_fill" ON "follows";
CREATE TRIGGER "follows_shard_fill" BEFORE INSERT ON "follows" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'follower_id', '');
DROP TRIGGER IF EXISTS "legal_answer_likes_shard_fill" ON "legal_answer_likes";
CREATE TRIGGER "legal_answer_likes_shard_fill" BEFORE INSERT ON "legal_answer_likes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'answer_id', 'legal_answers');
DROP TRIGGER IF EXISTS "legal_answers_shard_fill" ON "legal_answers";
CREATE TRIGGER "legal_answers_shard_fill" BEFORE INSERT ON "legal_answers" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'question_id', 'legal_questions');
DROP TRIGGER IF EXISTS "legal_questions_shard_fill" ON "legal_questions";
CREATE TRIGGER "legal_questions_shard_fill" BEFORE INSERT ON "legal_questions" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'author_id', '');
DROP TRIGGER IF EXISTS "message_edits_shard_fill" ON "message_edits";
CREATE TRIGGER "message_edits_shard_fill" BEFORE INSERT ON "message_edits" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'message_id', 'messages');
DROP TRIGGER IF EXISTS "message_hidden_shard_fill" ON "message_hidden";
CREATE TRIGGER "message_hidden_shard_fill" BEFORE INSERT ON "message_hidden" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'message_id', 'messages');
DROP TRIGGER IF EXISTS "message_pins_shard_fill" ON "message_pins";
CREATE TRIGGER "message_pins_shard_fill" BEFORE INSERT ON "message_pins" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
DROP TRIGGER IF EXISTS "message_reactions_shard_fill" ON "message_reactions";
CREATE TRIGGER "message_reactions_shard_fill" BEFORE INSERT ON "message_reactions" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'message_id', 'messages');
DROP TRIGGER IF EXISTS "messages_shard_fill" ON "messages";
CREATE TRIGGER "messages_shard_fill" BEFORE INSERT ON "messages" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'conversation_id', 'conversations');
DROP TRIGGER IF EXISTS "notification_quiet_hours_shard_fill" ON "notification_quiet_hours";
CREATE TRIGGER "notification_quiet_hours_shard_fill" BEFORE INSERT ON "notification_quiet_hours" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "notification_settings_shard_fill" ON "notification_settings";
CREATE TRIGGER "notification_settings_shard_fill" BEFORE INSERT ON "notification_settings" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "notifications_shard_fill" ON "notifications";
CREATE TRIGGER "notifications_shard_fill" BEFORE INSERT ON "notifications" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "payment_requests_shard_fill" ON "payment_requests";
CREATE TRIGGER "payment_requests_shard_fill" BEFORE INSERT ON "payment_requests" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "post_attachments_shard_fill" ON "post_attachments";
CREATE TRIGGER "post_attachments_shard_fill" BEFORE INSERT ON "post_attachments" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "post_likes_shard_fill" ON "post_likes";
CREATE TRIGGER "post_likes_shard_fill" BEFORE INSERT ON "post_likes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "post_media_shard_fill" ON "post_media";
CREATE TRIGGER "post_media_shard_fill" BEFORE INSERT ON "post_media" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "post_reposts_shard_fill" ON "post_reposts";
CREATE TRIGGER "post_reposts_shard_fill" BEFORE INSERT ON "post_reposts" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "post_shares_shard_fill" ON "post_shares";
CREATE TRIGGER "post_shares_shard_fill" BEFORE INSERT ON "post_shares" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "post_tags_shard_fill" ON "post_tags";
CREATE TRIGGER "post_tags_shard_fill" BEFORE INSERT ON "post_tags" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "post_view_events_shard_fill" ON "post_view_events";
CREATE TRIGGER "post_view_events_shard_fill" BEFORE INSERT ON "post_view_events" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "post_views_shard_fill" ON "post_views";
CREATE TRIGGER "post_views_shard_fill" BEFORE INSERT ON "post_views" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'post_id', 'posts');
DROP TRIGGER IF EXISTS "posts_shard_fill" ON "posts";
CREATE TRIGGER "posts_shard_fill" BEFORE INSERT ON "posts" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'author_id', '');
DROP TRIGGER IF EXISTS "push_tokens_shard_fill" ON "push_tokens";
CREATE TRIGGER "push_tokens_shard_fill" BEFORE INSERT ON "push_tokens" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "review_helpful_votes_shard_fill" ON "review_helpful_votes";
CREATE TRIGGER "review_helpful_votes_shard_fill" BEFORE INSERT ON "review_helpful_votes" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'review_id', 'reviews');
DROP TRIGGER IF EXISTS "reviews_shard_fill" ON "reviews";
CREATE TRIGGER "reviews_shard_fill" BEFORE INSERT ON "reviews" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases');
DROP TRIGGER IF EXISTS "saved_chat_messages_shard_fill" ON "saved_chat_messages";
CREATE TRIGGER "saved_chat_messages_shard_fill" BEFORE INSERT ON "saved_chat_messages" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "saved_items_shard_fill" ON "saved_items";
CREATE TRIGGER "saved_items_shard_fill" BEFORE INSERT ON "saved_items" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "stories_shard_fill" ON "stories";
CREATE TRIGGER "stories_shard_fill" BEFORE INSERT ON "stories" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'author_id', '');
DROP TRIGGER IF EXISTS "story_hidden_shard_fill" ON "story_hidden";
CREATE TRIGGER "story_hidden_shard_fill" BEFORE INSERT ON "story_hidden" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'owner_id', '');
DROP TRIGGER IF EXISTS "story_settings_shard_fill" ON "story_settings";
CREATE TRIGGER "story_settings_shard_fill" BEFORE INSERT ON "story_settings" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "story_views_shard_fill" ON "story_views";
CREATE TRIGGER "story_views_shard_fill" BEFORE INSERT ON "story_views" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'story_id', 'stories');
DROP TRIGGER IF EXISTS "user_blocks_shard_fill" ON "user_blocks";
CREATE TRIGGER "user_blocks_shard_fill" BEFORE INSERT ON "user_blocks" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'blocker_id', '');
DROP TRIGGER IF EXISTS "user_recent_stickers_shard_fill" ON "user_recent_stickers";
CREATE TRIGGER "user_recent_stickers_shard_fill" BEFORE INSERT ON "user_recent_stickers" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "user_sticker_packs_shard_fill" ON "user_sticker_packs";
CREATE TRIGGER "user_sticker_packs_shard_fill" BEFORE INSERT ON "user_sticker_packs" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
DROP TRIGGER IF EXISTS "voip_tokens_shard_fill" ON "voip_tokens";
CREATE TRIGGER "voip_tokens_shard_fill" BEFORE INSERT ON "voip_tokens" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('owner', 'user_id', '');
