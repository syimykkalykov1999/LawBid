-- Shard-ready step 2, part 2/4: backfill shard_id of existing rows with the
-- same rule the application uses for new rows (src/sharding/shard-id.ts):
--   owner key  -> hashShard(owner id) = the LAST byte of the owner's uuid
--                 (get_byte(uuid_send(x), 15)); Case: its client_id
--   parent key -> the parent's shard_id (children inherit), tried in the
--                 order of the manifest, then 0
-- Parents are updated before children (ordered by depth). Only rows whose
-- shard_id IS NULL are touched, so a re-run is a no-op and rows created
-- after part 1 (default 0 or the app's value) are never overwritten.
-- Row locks only (no table lock); at large volume run this part as batched
-- UPDATEs before the deploy instead.

UPDATE "attorney_tasks" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."attorney_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "call_log_hidden" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "cases" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."client_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "channels" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."owner_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_groups" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."created_by"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "consultation_settings" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."attorney_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "consultation_time_off" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."attorney_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "consultation_windows" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."attorney_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "contact_book_hashes" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."owner_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "contact_matches" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."owner_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "contact_sync_settings" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "follows" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."follower_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "legal_questions" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."author_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "notifications" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "notification_quiet_hours" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "notification_settings" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "posts" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."author_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "push_tokens" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "saved_chat_messages" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "saved_items" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "stories" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."author_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "story_hidden" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."owner_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "story_settings" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "user_blocks" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."blocker_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "user_recent_stickers" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "user_sticker_packs" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "voip_tokens" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."user_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "attorney_task_people" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "attorney_tasks" p WHERE p."id" = c."task_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "attorney_task_places" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "attorney_tasks" p WHERE p."id" = c."task_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "attorney_task_steps" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "attorney_tasks" p WHERE p."id" = c."task_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "bids" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "bid_drafts" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_billing" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_comments" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_conflict_checks" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_disputes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_expenses" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_extra_practices" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_invites" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_invoices" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_journal" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_payments" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_photos" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_reads" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_shares" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_sign_requests" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_states" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_tasks" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_task_events" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_time_entries" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_updates" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "channel_admins" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "channels" p WHERE p."id" = c."channel_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "channel_posts" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "channels" p WHERE p."id" = c."channel_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "channel_subscriptions" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "channels" p WHERE p."id" = c."channel_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_invites" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_groups" p WHERE p."id" = c."group_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_join_requests" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_groups" p WHERE p."id" = c."group_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_members" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_groups" p WHERE p."id" = c."group_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_messages" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_groups" p WHERE p."id" = c."group_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_polls" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_groups" p WHERE p."id" = c."group_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_topics" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_groups" p WHERE p."id" = c."group_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "client_reviews" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "comments" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "consultations" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), get_byte(uuid_send(c."client_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "contact_disclosures" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "contact_issue_reports" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "conversations" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), get_byte(uuid_send(c."client_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "legal_answers" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "legal_questions" p WHERE p."id" = c."question_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "payment_requests" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_attachments" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_likes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_media" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_reposts" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_shares" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_tags" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_views" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "post_view_events" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "reviews" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "cases" p WHERE p."id" = c."case_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "story_views" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "stories" p WHERE p."id" = c."story_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "bid_offers" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "bids" p WHERE p."id" = c."bid_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "calls" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "conversations" p WHERE p."id" = c."conversation_id"), get_byte(uuid_send(c."caller_id"), 15), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_comment_likes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "case_comments" p WHERE p."id" = c."comment_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_payment_refunds" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "case_payments" p WHERE p."id" = c."payment_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_signatures" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "case_sign_requests" p WHERE p."id" = c."request_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "case_task_items" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "case_tasks" p WHERE p."id" = c."task_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "channel_comments" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "channel_posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "channel_post_shares" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "channel_posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "channel_post_views" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "channel_posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "channel_reactions" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "channel_posts" p WHERE p."id" = c."post_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_poll_options" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_group_polls" p WHERE p."id" = c."poll_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_poll_votes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_group_polls" p WHERE p."id" = c."poll_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "chat_group_topic_reads" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "chat_group_topics" p WHERE p."id" = c."topic_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "client_review_appeals" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "client_reviews" p WHERE p."id" = c."review_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "client_review_helpful_votes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "client_reviews" p WHERE p."id" = c."review_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "comment_likes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "comments" p WHERE p."id" = c."comment_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "conversation_participants" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "conversations" p WHERE p."id" = c."conversation_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "legal_answer_likes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "legal_answers" p WHERE p."id" = c."answer_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "messages" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "conversations" p WHERE p."id" = c."conversation_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "message_pins" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "conversations" p WHERE p."id" = c."conversation_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "review_helpful_votes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "reviews" p WHERE p."id" = c."review_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "call_participants" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "calls" p WHERE p."id" = c."call_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "call_votes" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "calls" p WHERE p."id" = c."call_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "message_edits" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "messages" p WHERE p."id" = c."message_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "message_hidden" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "messages" p WHERE p."id" = c."message_id"), 0) WHERE c."shard_id" IS NULL;
UPDATE "message_reactions" c SET "shard_id" = COALESCE((SELECT p."shard_id" FROM "messages" p WHERE p."id" = c."message_id"), 0) WHERE c."shard_id" IS NULL;
