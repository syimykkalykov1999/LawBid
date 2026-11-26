-- THIRD_PASS_A D7 (26.11, docs/dev/THIRD_PASS_A_BACKEND_2026-11-26.md):
-- foreign-key columns without a leading index. PostgreSQL does not index
-- the referencing side by itself (PG docs 5.5.5 «Foreign Keys»): a delete
-- or key update of the parent row scans the whole child table, under the
-- child lock, and a lookup «all X of this parent» scans too. Partial on
-- «col IS NOT NULL», like the other concurrent indexes, so Prisma leaves
-- them out of its schema diff; a NULL never matches a parent key, so every
-- FK check and every `WHERE col = $1` can use the index.
--
-- ON DELETE CASCADE children (a parent delete scanned them in full):
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_shares_user_id_idx
  ON case_shares (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS call_log_hidden_call_id_idx
  ON call_log_hidden (call_id) WHERE call_id IS NOT NULL;
-- RESTRICT / SET NULL children (the parent check and the admin lookups):
CREATE INDEX CONCURRENTLY IF NOT EXISTS moderation_actions_admin_id_idx
  ON moderation_actions (admin_id) WHERE admin_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS moderation_actions_report_id_idx
  ON moderation_actions (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS data_access_log_admin_id_idx
  ON data_access_log (admin_id) WHERE admin_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_plan_id_idx
  ON subscriptions (plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS client_subscriptions_plan_id_idx
  ON client_subscriptions (plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_consents_document_id_idx
  ON user_consents (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS dmca_notices_report_id_idx
  ON dmca_notices (report_id) WHERE report_id IS NOT NULL;
-- The rest found by the same catalog query on a database migrated with
-- every migration and concurrent file (26.11). Cascade children first:
CREATE INDEX CONCURRENTLY IF NOT EXISTS assistant_liability_acceptances_membership_id_idx
  ON assistant_liability_acceptances (membership_id) WHERE membership_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS assistant_requests_membership_id_idx
  ON assistant_requests (membership_id) WHERE membership_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS client_review_appeals_appellant_id_idx
  ON client_review_appeals (appellant_id) WHERE appellant_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_recent_stickers_sticker_id_idx
  ON user_recent_stickers (sticker_id) WHERE sticker_id IS NOT NULL;
-- RESTRICT / SET NULL children:
CREATE INDEX CONCURRENTLY IF NOT EXISTS attorney_licenses_verified_by_idx
  ON attorney_licenses (verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS attorney_tasks_assignee_membership_id_idx
  ON attorney_tasks (assignee_membership_id) WHERE assignee_membership_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS attorney_tasks_created_by_membership_id_idx
  ON attorney_tasks (created_by_membership_id) WHERE created_by_membership_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_disputes_opened_by_idx
  ON case_disputes (opened_by) WHERE opened_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_disputes_resolved_by_idx
  ON case_disputes (resolved_by) WHERE resolved_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS client_profiles_state_code_idx
  ON client_profiles (state_code) WHERE state_code IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS contact_issue_reports_attorney_id_idx
  ON contact_issue_reports (attorney_id) WHERE attorney_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS contact_issue_reports_bid_id_idx
  ON contact_issue_reports (bid_id) WHERE bid_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS contact_issue_reports_client_id_idx
  ON contact_issue_reports (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS contact_issue_reports_resolved_by_idx
  ON contact_issue_reports (resolved_by) WHERE resolved_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS conversations_requested_by_idx
  ON conversations (requested_by) WHERE requested_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS data_access_requests_handled_by_idx
  ON data_access_requests (handled_by) WHERE handled_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS feature_flags_updated_by_idx
  ON feature_flags (updated_by) WHERE updated_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS i18n_translations_lang_idx
  ON i18n_translations (lang) WHERE lang IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS integration_credentials_created_by_idx
  ON integration_credentials (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS reports_handled_by_idx
  ON reports (handled_by) WHERE handled_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS verification_documents_state_code_idx
  ON verification_documents (state_code) WHERE state_code IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS verification_requests_reviewed_by_idx
  ON verification_requests (reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS form_templates_practice_area_id_idx
  ON form_templates (practice_area_id) WHERE practice_area_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_approvals_approved_by_idx
  ON admin_approvals (approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_approvals_rejected_by_idx
  ON admin_approvals (rejected_by) WHERE rejected_by IS NOT NULL;
-- Left for the next update on purpose (owner 17.11: gifts and groups are
-- not touched now): gift_sends.gift_id, chat_group_polls.creator_id,
-- chat_group_poll_votes.user_id.
