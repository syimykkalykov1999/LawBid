# LawBid — ERD

Generated from `apps/api/prisma/schema.prisma` by
`npm run db:erd --workspace apps/api` (docs/02_DATABASE.md §8, stage
2.7). Do not edit by hand. Computed columns, partial / hash-sharded /
GIN indexes, CHECKs and DB roles live in raw-SQL migrations and are not
drawn here.

100 tables.

```mermaid
erDiagram
  users {
    String id PK
    enum_UserRole role "nullable"
    enum_UserStatus status
    String first_name "nullable"
    String last_name "nullable"
    String avatar_file_id FK "nullable"
    String email UK "nullable"
    DateTime email_verified_at "nullable"
    String phone_e164 UK "nullable"
    DateTime phone_verified_at "nullable"
    String ui_language
    enum_ThemePref theme
    String suspended_reason "nullable"
    DateTime last_active_at "nullable"
    Boolean show_activity_status
    DateTime deletion_requested_at "nullable"
    DateTime deleted_at "nullable"
    DateTime anonymized_at "nullable"
    String full_name_lower "nullable"
    DateTime created_at
    DateTime updated_at
  }
  files {
    String id PK
    String owner_user_id FK
    enum_FilePurpose purpose
    String s3_bucket
    String s3_key UK
    String mime
    BigInt size_bytes
    String sha256
    Int width "nullable"
    Int height "nullable"
    enum_ScanStatus scan_status
    Boolean is_public
    DateTime deleted_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  user_identifiers {
    String id PK
    String user_id FK
    enum_IdentifierType provider
    String provider_uid
    DateTime verified_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  sessions {
    String id PK
    String user_id FK
    String session_chain_id
    String device_id "nullable"
    String device_name "nullable"
    String platform "nullable"
    String app_version "nullable"
    String ip "nullable"
    String user_agent "nullable"
    String refresh_hash UK
    DateTime last_used_at "nullable"
    DateTime expires_at
    DateTime revoked_at "nullable"
    String revoked_reason "nullable"
    String replaced_by_session_id "nullable"
    DateTime created_at
    DateTime updated_at
  }
  auth_events {
    String id PK
    String user_id FK "nullable"
    String event_type
    Boolean success
    String identifier_hash "nullable"
    String ip "nullable"
    String device_id "nullable"
    String user_agent "nullable"
    Json meta "nullable"
    DateTime created_at
    Int created_shard
  }
  legal_documents {
    String id PK
    enum_LegalDocType doc_type
    String version
    String locale
    String content_url "nullable"
    String content_md "nullable"
    DateTime published_at "nullable"
    Boolean is_current
    DateTime created_at
    DateTime updated_at
  }
  user_consents {
    String id PK
    String user_id FK
    enum_ConsentType consent_type
    String document_id FK "nullable"
    Boolean granted
    String ip "nullable"
    String device_id "nullable"
    DateTime created_at
  }
  onboarding_state {
    String user_id PK,FK
    String current_step "nullable"
    DateTime completed_at "nullable"
    Json data "nullable"
    DateTime created_at
    DateTime updated_at
  }
  blocked_email_domains {
    String domain PK
    String reason
  }
  feature_flags {
    String key PK
    Boolean enabled
    Int rollout_percent
    String description "nullable"
    String updated_by FK "nullable"
    DateTime updated_at
  }
  app_config {
    String key PK
    Json value
    DateTime updated_at
  }
  i18n_languages {
    String code PK
    String name_native
    Boolean is_active
    Boolean is_rtl
    Int sort
  }
  i18n_keys {
    String id PK
    String key UK
    String description "nullable"
    DateTime created_at
    DateTime updated_at
  }
  i18n_translations {
    String key_id PK,FK
    String lang PK,FK
    String value
    Int version
    DateTime updated_at
  }
  i18n_bundle_versions {
    String lang PK,FK
    Int version
    DateTime updated_at
  }
  states {
    String code PK
    String name
    Boolean is_active
  }
  practice_areas {
    String id PK
    String parent_id FK "nullable"
    String code UK
    String name_en
    String i18n_key
    Int sort
    Boolean is_active
  }
  client_profiles {
    String user_id PK,FK
    String state_code FK
    enum_ContactMethod preferred_contact_method "nullable"
    String preferred_contact_note "nullable"
    String username "nullable"
    String username_lower UK "nullable"
    DateTime username_changed_at "nullable"
    Int posts_count
    Int followers_count
    Int following_count
    Decimal rating_avg
    Int rating_count
    DateTime created_at
    DateTime updated_at
  }
  attorney_profiles {
    String user_id PK,FK
    String username
    String username_lower UK
    String bio "nullable"
    String firm_name "nullable"
    enum_VerificationStatus verification_status
    DateTime verified_at "nullable"
    String verified_first_name "nullable"
    String verified_last_name "nullable"
    Boolean name_mismatch
    DateTime username_changed_at "nullable"
    Decimal rating_avg
    Int rating_count
    Int posts_count
    Int followers_count
    Int following_count
    DateTime created_at
    DateTime updated_at
    Boolean new_case_alerts_custom
  }
  attorney_licenses {
    String id PK
    String attorney_id FK
    String state_code FK
    String bar_number
    enum_LicenseStatus license_status
    DateTime expires_at "nullable"
    DateTime verified_at "nullable"
    String verified_by FK "nullable"
    Json auto_check_result "nullable"
    String rejection_code "nullable"
    String rejection_note "nullable"
    DateTime created_at
    DateTime updated_at
  }
  attorney_practice_areas {
    String attorney_id PK,FK
    String practice_area_id PK,FK
    DateTime created_at
  }
  new_case_alert_practices {
    String attorney_id PK,FK
    String practice_area_id PK,FK
    DateTime created_at
  }
  verification_requests {
    String id PK
    String attorney_id FK
    enum_VerificationRequestStatus status
    enum_VerificationProvider provider
    String provider_ref "nullable"
    DateTime submitted_at "nullable"
    String reviewed_by FK "nullable"
    DateTime reviewed_at "nullable"
    String rejection_reason "nullable"
    String admin_note "nullable"
    String info_request_message "nullable"
    String applicant_comment "nullable"
    String rejection_code "nullable"
    DateTime created_at
    DateTime updated_at
  }
  verification_documents {
    String id PK
    String request_id FK
    enum_VerificationDocType doc_type
    String file_id FK
    String state_code FK "nullable"
    String notes "nullable"
    String side "nullable"
    DateTime created_at
    DateTime updated_at
  }
  verification_checks {
    String id PK
    String request_id FK
    enum_VerificationCheckType check_type
    enum_VerificationProvider provider
    enum_CheckResult result
    Json details
    DateTime checked_at
    DateTime created_at
  }
  cases {
    String id PK
    String client_id FK
    String title
    String description
    String practice_area_id FK
    String primary_state_code FK
    String city "nullable"
    enum_BudgetMode budget_mode
    Int budget_cents "nullable"
    enum_CaseStatus status
    String accepted_bid_id FK,UK "nullable"
    Int view_count
    Int bids_count
    Int comment_count
    Int share_count
    DateTime last_activity_at
    DateTime stale_prompt_sent_at "nullable"
    DateTime archived_at "nullable"
    DateTime client_completed_at "nullable"
    DateTime attorney_confirmed_at "nullable"
    DateTime auto_close_at "nullable"
    DateTime closed_at "nullable"
    DateTime deleted_at "nullable"
    tsvector search_tsv "nullable"
    DateTime created_at
    DateTime updated_at
  }
  case_states {
    String case_id PK,FK
    String state_code PK,FK
    Boolean is_primary
  }
  bids {
    String id PK
    String case_id FK
    String attorney_id FK
    enum_BidStatus status
    enum_FeeType fee_type
    Int amount_cents
    String message
    enum_StartAvailability start_availability
    DateTime start_date "nullable"
    Int estimated_duration_days "nullable"
    Int round_count
    enum_PartyRole turn
    Boolean outside_practice
    DateTime decided_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  bid_offers {
    String id PK
    String bid_id FK
    Int round_no
    enum_PartyRole from_role
    enum_FeeType fee_type
    Int amount_cents
    String message "nullable"
    enum_OfferStatus status
    DateTime created_at
  }
  case_journal {
    String id PK
    String case_id FK
    String client_id FK
    String actor_user_id FK "nullable"
    enum_UserRole actor_role "nullable"
    String attorney_id FK "nullable"
    enum_CaseJournalEvent event_type
    Json payload
    String prev_hash "nullable"
    String row_hash
    DateTime retain_until
    DateTime created_at
  }
  contact_disclosures {
    String id PK
    String case_id FK
    String bid_id FK,UK
    String client_id FK
    String attorney_id FK
    String ip "nullable"
    String device_id "nullable"
    DateTime disclosed_at
  }
  contact_issue_reports {
    String id PK
    String case_id FK
    String bid_id FK
    String attorney_id FK
    String client_id FK
    enum_ContactIssueType issue_type
    String note "nullable"
    enum_ContactIssueStatus status
    String resolved_by FK "nullable"
    DateTime resolved_at "nullable"
    String resolution_note "nullable"
    DateTime created_at
    DateTime updated_at
  }
  case_disputes {
    String id PK
    String case_id FK
    String opened_by FK
    String reason
    enum_DisputeStatus status
    String resolved_by FK "nullable"
    DateTime resolved_at "nullable"
    String resolution_note "nullable"
    DateTime created_at
    DateTime updated_at
  }
  reviews {
    String id PK
    String case_id FK,UK "nullable"
    String client_id FK
    String attorney_id FK
    Int rating
    String body "nullable"
    enum_ReviewStatus status
    DateTime edited_at "nullable"
    String reply "nullable"
    DateTime reply_at "nullable"
    Int helpful_count
    DateTime created_at
    DateTime updated_at
  }
  posts {
    String id PK
    String author_id FK
    String body
    String title "nullable"
    String practice_area_id FK "nullable"
    enum_PostKind kind
    String video_asset_id FK,UK "nullable"
    String language "nullable"
    enum_ContentStatus status
    Int like_count
    Int comment_count
    Int save_count
    Int share_count
    DateTime edited_at "nullable"
    DateTime deleted_at "nullable"
    tsvector search_tsv "nullable"
    DateTime created_at
    Int created_shard
    DateTime updated_at
  }
  case_photos {
    String id PK
    String case_id FK
    String file_id FK
    Int position
    DateTime created_at
  }
  post_media {
    String id PK
    String post_id FK
    String file_id FK
    enum_MediaType media_type
    Int position
    Int width "nullable"
    Int height "nullable"
    DateTime created_at
  }
  tags {
    String id PK
    String tag_lower UK
    DateTime created_at
  }
  post_tags {
    String post_id PK,FK
    String tag_id PK,FK
  }
  comments {
    String id PK
    String post_id FK
    String author_id FK
    String parent_comment_id FK "nullable"
    String body
    enum_ContentStatus status
    Int like_count
    Int reply_count
    DateTime deleted_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  post_likes {
    String post_id PK,FK
    String user_id PK,FK
    DateTime created_at
  }
  comment_likes {
    String comment_id PK,FK
    String user_id PK,FK
    DateTime created_at
  }
  follows {
    String follower_id PK,FK
    String followee_id PK,FK
    DateTime created_at
  }
  user_blocks {
    String blocker_id PK,FK
    String blocked_id PK,FK
    DateTime created_at
  }
  saved_items {
    String user_id PK,FK
    enum_SavedItemType item_type PK
    String item_id PK
    DateTime created_at
  }
  conversations {
    String id PK
    String case_id FK "nullable"
    String attorney_id FK
    String client_id FK
    String bid_id FK "nullable"
    enum_ConversationStatus status
    Boolean contacts_unlocked
    enum_MessageRequestStatus request_status
    String requested_by FK "nullable"
    DateTime last_message_at "nullable"
    String last_message_id "nullable"
    DateTime created_at
    DateTime updated_at
  }
  conversation_participants {
    String conversation_id PK,FK
    String user_id PK,FK
    String last_read_message_id "nullable"
    DateTime muted_until "nullable"
    enum_ChatFolder folder "nullable"
    DateTime waiting_since "nullable"
    String note "nullable"
    DateTime pinned_at "nullable"
    DateTime hidden_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  calls {
    String id PK
    String conversation_id FK
    String caller_id FK
    String callee_id FK
    enum_CallStatus status
    DateTime answered_at "nullable"
    DateTime ended_at "nullable"
    Int duration_sec "nullable"
    String end_reason "nullable"
    DateTime created_at
    DateTime updated_at
  }
  messages {
    String id PK
    String conversation_id FK
    String sender_id FK "nullable"
    enum_MessageType type
    String body_original
    String body_display
    Boolean contact_masked
    String client_message_id
    String file_id FK "nullable"
    Int duration_ms "nullable"
    String file_name "nullable"
    String sent_by_membership_id "nullable"
    String sent_by_name "nullable"
    DateTime listened_at "nullable"
    String sticker_id FK "nullable"
    DateTime deleted_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  notifications {
    String id PK
    String user_id FK
    enum_NotificationType type
    enum_NotificationCategory category
    Json payload
    DateTime read_at "nullable"
    DateTime created_at
    String dedupe_key "nullable"
    Int aggregate_count
  }
  notification_settings {
    String user_id PK,FK
    enum_NotificationCategory category PK
    Boolean push_enabled
    Boolean email_enabled
    DateTime updated_at
  }
  notification_quiet_hours {
    String user_id PK,FK
    DateTime start_time
    DateTime end_time
    String timezone
    DateTime updated_at
  }
  push_tokens {
    String id PK
    String user_id FK
    String session_id FK
    String fcm_token UK
    String platform
    DateTime last_seen_at
    DateTime created_at
  }
  stripe_customers {
    String user_id PK,FK
    String stripe_customer_id UK
    DateTime created_at
  }
  subscriptions {
    String id PK
    String user_id FK,UK
    String stripe_subscription_id UK "nullable"
    enum_SubscriptionStatus status
    Int price_cents
    DateTime trial_started_at "nullable"
    DateTime trial_ends_at "nullable"
    DateTime current_period_start "nullable"
    DateTime current_period_end "nullable"
    Boolean cancel_at_period_end
    DateTime canceled_at "nullable"
    DateTime grace_ends_at "nullable"
    String card_fingerprint "nullable"
    enum_SubscriptionPlan plan
    Int assistant_seats
    DateTime created_at
    DateTime updated_at
  }
  payments {
    String id PK
    String user_id FK
    String stripe_invoice_id UK "nullable"
    String stripe_payment_intent_id "nullable"
    Int amount_cents
    String currency
    enum_PaymentStatus status
    DateTime paid_at "nullable"
    String failure_code "nullable"
    DateTime created_at
    DateTime updated_at
  }
  stripe_webhook_events {
    String stripe_event_id PK
    String type
    Json payload
    DateTime processed_at "nullable"
    Int attempts
    DateTime created_at
  }
  reports {
    String id PK
    String reporter_id FK
    enum_ReportTargetType target_type
    String target_id
    enum_ReportReason reason
    String note "nullable"
    enum_ReportStatus status
    String handled_by FK "nullable"
    DateTime handled_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  moderation_actions {
    String id PK
    String report_id FK "nullable"
    String admin_id FK
    enum_ReportTargetType target_type
    String target_id
    enum_ModerationActionType action
    String reason "nullable"
    DateTime created_at
  }
  admin_profiles {
    String user_id PK,FK
    enum_AdminRole admin_role
    Json permissions
    DateTime created_at
    DateTime updated_at
  }
  admin_role_templates {
    String id PK
    String name UK
    Json permissions
    String created_by
    DateTime created_at
    DateTime updated_at
  }
  account_bans {
    String id PK
    String kind
    String value
    String user_id "nullable"
    String reason
    DateTime expires_at "nullable"
    String created_by
    DateTime created_at
    DateTime lifted_at "nullable"
    String lifted_by "nullable"
    String lift_reason "nullable"
  }
  audit_log {
    String id PK
    String admin_id FK
    String action
    String target_type
    String target_id "nullable"
    String justification "nullable"
    Json before "nullable"
    Json after "nullable"
    String ip "nullable"
    DateTime created_at
    Int created_shard
  }
  data_access_requests {
    String id PK
    enum_DataRequestType request_type
    String reference_number
    String agency
    DateTime received_at
    String scope
    String handled_by FK
    enum_DataRequestStatus status
    DateTime closed_at "nullable"
    String notes "nullable"
    DateTime created_at
    DateTime updated_at
  }
  data_access_log {
    String id PK
    String request_id FK
    String admin_id FK
    String entity_type
    String entity_id
    DateTime accessed_at
  }
  admin_credentials {
    String user_id PK,FK
    String totp_secret_enc
    DateTime totp_enabled_at "nullable"
    DateTime last_login_at "nullable"
    String login UK "nullable"
    String password_hash "nullable"
    DateTime password_changed_at "nullable"
    String security_question "nullable"
    String security_answer_hash "nullable"
    DateTime created_at
    DateTime updated_at
  }
  data_export_jobs {
    String id PK
    String user_id FK
    enum_DataExportType type
    enum_DataExportStatus status
    String file_id FK "nullable"
    DateTime expires_at "nullable"
    String error "nullable"
    DateTime created_at
    DateTime updated_at
  }
  case_comments {
    String id PK
    String case_id FK
    String author_id FK
    String parent_comment_id FK "nullable"
    String body
    enum_ContentStatus status
    Int like_count
    Int reply_count
    DateTime deleted_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  case_comment_likes {
    String comment_id PK,FK
    String user_id PK,FK
    DateTime created_at
  }
  post_shares {
    String id PK
    String post_id FK
    String user_id FK
    DateTime created_at
  }
  case_shares {
    String id PK
    String case_id FK
    String user_id FK
    DateTime created_at
  }
  client_reviews {
    String id PK
    String case_id FK "nullable"
    String attorney_id FK
    String client_id FK
    Int rating
    String body "nullable"
    enum_ReviewStatus status
    String reply "nullable"
    DateTime reply_at "nullable"
    Int helpful_count
    DateTime edited_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  review_helpful_votes {
    String review_id PK,FK
    String user_id PK,FK
    DateTime created_at
  }
  client_review_helpful_votes {
    String review_id PK,FK
    String user_id PK,FK
    DateTime created_at
  }
  client_review_appeals {
    String id PK
    String review_id FK,UK
    String appellant_id FK
    String reason
    enum_ReviewAppealStatus status
    DateTime auto_remove_at
    DateTime decided_at "nullable"
    String decided_by "nullable"
    String admin_note "nullable"
    DateTime created_at
  }
  assistant_memberships {
    String id PK
    String attorney_id FK
    String assistant_user_id FK "nullable"
    String phone_e164
    String display_name "nullable"
    enum_AssistantStatus status
    enum_AssistantApproval approval
    DateTime created_at
    DateTime joined_at "nullable"
    DateTime removed_at "nullable"
  }
  assistant_activity {
    String id PK
    String attorney_id
    String membership_id FK
    String action
    String target_type "nullable"
    String target_id "nullable"
    String summary "nullable"
    DateTime created_at
  }
  assistant_requests {
    String id PK
    String attorney_id
    String membership_id FK
    enum_AssistantRequestKind kind
    Json payload
    enum_AssistantRequestStatus status
    String result_id "nullable"
    String note "nullable"
    DateTime created_at
    DateTime decided_at "nullable"
  }
  attorney_tasks {
    String id PK
    String attorney_id FK
    String created_by_membership_id FK "nullable"
    enum_AttorneyTaskKind kind
    String title
    String notes "nullable"
    DateTime due_at "nullable"
    String location "nullable"
    String case_id FK "nullable"
    String contact_name "nullable"
    String contact_phone "nullable"
    String contact_email "nullable"
    enum_AttorneyTaskStatus status
    String outcome_note "nullable"
    DateTime rescheduled_to "nullable"
    DateTime done_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  attorney_task_steps {
    String id PK
    String task_id FK
    Int position
    enum_AttorneyTaskKind kind "nullable"
    String title
    DateTime due_at "nullable"
    String location "nullable"
    String contact_name "nullable"
    String contact_phone "nullable"
    String contact_email "nullable"
    enum_AttorneyTaskStatus status
    String note "nullable"
    DateTime done_at "nullable"
    String created_by_name "nullable"
    DateTime created_at
    DateTime updated_at
  }
  bid_drafts {
    String id PK
    String attorney_id FK
    String case_id FK
    Json payload
    String prepared_by_name "nullable"
    DateTime created_at
    DateTime updated_at
  }
  admin_broadcasts {
    String id PK
    String admin_id
    String title
    String body
    String audience
    String state_code "nullable"
    BigInt recipients
    DateTime created_at
  }
  assistant_liability_acceptances {
    String id PK
    String attorney_id FK
    String membership_id FK
    Boolean granted
    String terms_version
    String ip "nullable"
    String user_agent "nullable"
    DateTime created_at
  }
  integration_credentials {
    String id PK
    String provider
    Int version
    enum_IntegrationCredentialStatus status
    String secret_enc
    String kid
    Json public_config
    Json masked
    String fingerprint
    String created_by FK "nullable"
    DateTime created_at
    DateTime activated_at "nullable"
    DateTime retired_at "nullable"
    DateTime last_test_at "nullable"
    Boolean last_test_ok "nullable"
    String last_test_error "nullable"
  }
  video_assets {
    String id PK
    String owner_user_id FK
    String provider
    String library_id
    String external_id UK
    enum_VideoAssetStatus status
    Int duration_sec "nullable"
    Int width "nullable"
    Int height "nullable"
    BigInt storage_bytes "nullable"
    String failure_reason "nullable"
    DateTime upload_expires_at
    DateTime created_at
    DateTime ready_at "nullable"
    DateTime deleted_at "nullable"
    DateTime purged_at "nullable"
  }
  contract_grants {
    String id PK
    String user_id
    Int months
    Int assistant_seats
    DateTime starts_at
    DateTime ends_at
    String contract_ref "nullable"
    String note "nullable"
    String created_by
    DateTime revoked_at "nullable"
    String revoked_by "nullable"
    String revoke_reason "nullable"
    DateTime created_at
    DateTime updated_at
  }
  promo_codes {
    String id PK
    String code UK
    String description "nullable"
    String discount_type
    Int percent_off "nullable"
    Int amount_off_cents "nullable"
    Int free_days "nullable"
    String audience
    String applies_to
    Int max_redemptions "nullable"
    Int redeemed_count
    DateTime starts_at "nullable"
    DateTime expires_at "nullable"
    Boolean active
    String stripe_coupon_id "nullable"
    String created_by
    DateTime created_at
    DateTime updated_at
  }
  promo_redemptions {
    String id PK
    String promo_id
    String user_id
    Int amount_off_cents "nullable"
    String payment_id "nullable"
    DateTime created_at
  }
  refunds {
    String id PK
    String payment_id
    String user_id
    Int amount_cents
    String reason
    String status
    String stripe_refund_id UK "nullable"
    String failure_reason "nullable"
    String admin_id
    DateTime created_at
    DateTime updated_at
  }
  referral_codes {
    String id PK
    String user_id UK
    String code UK
    DateTime created_at
  }
  referrals {
    String id PK
    String referrer_id
    String referee_id UK
    String code
    String status
    String referrer_role
    String referee_role
    Json referrer_reward
    Json referee_reward
    DateTime qualified_at "nullable"
    DateTime rewarded_at "nullable"
    String rejected_reason "nullable"
    DateTime created_at
    DateTime updated_at
  }
  case_promotions {
    String id PK
    String case_id
    String user_id
    Int days
    Int price_cents_per_day
    Int total_cents
    String status
    DateTime starts_at "nullable"
    DateTime ends_at "nullable"
    String stripe_checkout_id UK "nullable"
    String payment_id "nullable"
    String promo_code_id "nullable"
    String granted_by "nullable"
    String canceled_by "nullable"
    String cancel_reason "nullable"
    Int impressions
    DateTime created_at
    DateTime updated_at
  }
  support_tickets {
    String id PK
    String user_id
    String subject
    String category
    String status
    String priority
    String assignee_id "nullable"
    Boolean unread_by_admin
    Boolean unread_by_user
    DateTime last_message_at
    DateTime resolved_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  support_messages {
    String id PK
    String ticket_id
    String author_user_id "nullable"
    String author_admin_id "nullable"
    Boolean internal
    String body
    DateTime created_at
  }
  email_templates {
    String key PK
    String locale PK
    String subject
    String text_body
    String html_body "nullable"
    Boolean enabled
    String updated_by "nullable"
    DateTime created_at
    DateTime updated_at
  }
  sticker_packs {
    String id PK
    String owner_user_id FK "nullable"
    String title
    String short_name UK
    Boolean is_official
    String status
    Int sticker_count
    Int install_count
    DateTime created_at
    DateTime updated_at
    DateTime deleted_at "nullable"
  }
  stickers {
    String id PK
    String pack_id FK
    String file_id FK,UK
    String emoji
    Int position
    DateTime created_at
    DateTime deleted_at "nullable"
  }
  user_sticker_packs {
    String user_id PK,FK
    String pack_id PK,FK
    Int position
    DateTime installed_at
  }
  user_recent_stickers {
    String user_id PK,FK
    String sticker_id PK,FK
    DateTime used_at
  }
  client_verifications {
    String id PK
    String user_id FK,UK
    String status
    Json document_file_ids
    String note "nullable"
    DateTime submitted_at
    DateTime reviewed_at "nullable"
    String reviewed_by "nullable"
    String reject_reason "nullable"
    String revoke_reason "nullable"
    String stripe_checkout_id "nullable"
    String stripe_subscription_id UK "nullable"
    String sub_status
    DateTime current_period_end "nullable"
    Boolean cancel_at_period_end
    DateTime created_at
    DateTime updated_at
  }
  users }o--o| files : "avatar_file_id"
  files }o--|| users : "owner_user_id"
  user_identifiers }o--|| users : "user_id"
  sessions }o--|| users : "user_id"
  auth_events }o--o| users : "user_id"
  user_consents }o--|| users : "user_id"
  user_consents }o--o| legal_documents : "document_id"
  onboarding_state |o--|| users : "user_id"
  feature_flags }o--o| users : "updated_by"
  i18n_translations }o--|| i18n_keys : "key_id"
  i18n_translations }o--|| i18n_languages : "lang"
  i18n_bundle_versions |o--|| i18n_languages : "lang"
  practice_areas }o--o| practice_areas : "parent_id"
  client_profiles |o--|| users : "user_id"
  client_profiles }o--|| states : "state_code"
  attorney_profiles |o--|| users : "user_id"
  attorney_licenses }o--|| attorney_profiles : "attorney_id"
  attorney_licenses }o--|| states : "state_code"
  attorney_licenses }o--o| users : "verified_by"
  attorney_practice_areas }o--|| attorney_profiles : "attorney_id"
  attorney_practice_areas }o--|| practice_areas : "practice_area_id"
  new_case_alert_practices }o--|| attorney_profiles : "attorney_id"
  new_case_alert_practices }o--|| practice_areas : "practice_area_id"
  verification_requests }o--|| attorney_profiles : "attorney_id"
  verification_requests }o--o| users : "reviewed_by"
  verification_documents }o--|| verification_requests : "request_id"
  verification_documents }o--|| files : "file_id"
  verification_documents }o--o| states : "state_code"
  verification_checks }o--|| verification_requests : "request_id"
  cases }o--|| users : "client_id"
  cases }o--|| practice_areas : "practice_area_id"
  cases }o--|| states : "primary_state_code"
  cases |o--o| bids : "accepted_bid_id"
  case_states }o--|| cases : "case_id"
  case_states }o--|| states : "state_code"
  bids }o--|| cases : "case_id"
  bids }o--|| users : "attorney_id"
  bid_offers }o--|| bids : "bid_id"
  case_journal }o--|| cases : "case_id"
  case_journal }o--|| users : "client_id"
  case_journal }o--o| users : "actor_user_id"
  case_journal }o--o| users : "attorney_id"
  contact_disclosures }o--|| cases : "case_id"
  contact_disclosures |o--|| bids : "bid_id"
  contact_disclosures }o--|| users : "client_id"
  contact_disclosures }o--|| users : "attorney_id"
  contact_issue_reports }o--|| cases : "case_id"
  contact_issue_reports }o--|| bids : "bid_id"
  contact_issue_reports }o--|| users : "attorney_id"
  contact_issue_reports }o--|| users : "client_id"
  contact_issue_reports }o--o| users : "resolved_by"
  case_disputes }o--|| cases : "case_id"
  case_disputes }o--|| users : "opened_by"
  case_disputes }o--o| users : "resolved_by"
  reviews |o--o| cases : "case_id"
  reviews }o--|| users : "client_id"
  reviews }o--|| users : "attorney_id"
  posts }o--|| users : "author_id"
  posts }o--o| practice_areas : "practice_area_id"
  posts |o--o| video_assets : "video_asset_id"
  case_photos }o--|| cases : "case_id"
  case_photos }o--|| files : "file_id"
  post_media }o--|| posts : "post_id"
  post_media }o--|| files : "file_id"
  post_tags }o--|| posts : "post_id"
  post_tags }o--|| tags : "tag_id"
  comments }o--|| posts : "post_id"
  comments }o--|| users : "author_id"
  comments }o--o| comments : "parent_comment_id"
  post_likes }o--|| posts : "post_id"
  post_likes }o--|| users : "user_id"
  comment_likes }o--|| comments : "comment_id"
  comment_likes }o--|| users : "user_id"
  follows }o--|| users : "follower_id"
  follows }o--|| users : "followee_id"
  user_blocks }o--|| users : "blocker_id"
  user_blocks }o--|| users : "blocked_id"
  saved_items }o--|| users : "user_id"
  conversations }o--o| cases : "case_id"
  conversations }o--|| users : "attorney_id"
  conversations }o--|| users : "client_id"
  conversations }o--o| bids : "bid_id"
  conversations }o--o| users : "requested_by"
  conversation_participants }o--|| conversations : "conversation_id"
  conversation_participants }o--|| users : "user_id"
  calls }o--|| conversations : "conversation_id"
  calls }o--|| users : "caller_id"
  calls }o--|| users : "callee_id"
  messages }o--|| conversations : "conversation_id"
  messages }o--o| users : "sender_id"
  messages }o--o| files : "file_id"
  messages }o--o| stickers : "sticker_id"
  notifications }o--|| users : "user_id"
  notification_settings }o--|| users : "user_id"
  notification_quiet_hours |o--|| users : "user_id"
  push_tokens }o--|| users : "user_id"
  push_tokens }o--|| sessions : "session_id"
  stripe_customers |o--|| users : "user_id"
  subscriptions |o--|| users : "user_id"
  payments }o--|| users : "user_id"
  reports }o--|| users : "reporter_id"
  reports }o--o| users : "handled_by"
  moderation_actions }o--o| reports : "report_id"
  moderation_actions }o--|| users : "admin_id"
  admin_profiles |o--|| users : "user_id"
  audit_log }o--|| users : "admin_id"
  data_access_requests }o--|| users : "handled_by"
  data_access_log }o--|| data_access_requests : "request_id"
  data_access_log }o--|| users : "admin_id"
  admin_credentials |o--|| users : "user_id"
  data_export_jobs }o--|| users : "user_id"
  data_export_jobs }o--o| files : "file_id"
  case_comments }o--|| cases : "case_id"
  case_comments }o--|| users : "author_id"
  case_comments }o--o| case_comments : "parent_comment_id"
  case_comment_likes }o--|| case_comments : "comment_id"
  case_comment_likes }o--|| users : "user_id"
  post_shares }o--|| posts : "post_id"
  post_shares }o--|| users : "user_id"
  case_shares }o--|| cases : "case_id"
  case_shares }o--|| users : "user_id"
  client_reviews }o--o| cases : "case_id"
  client_reviews }o--|| users : "attorney_id"
  client_reviews }o--|| users : "client_id"
  review_helpful_votes }o--|| reviews : "review_id"
  review_helpful_votes }o--|| users : "user_id"
  client_review_helpful_votes }o--|| client_reviews : "review_id"
  client_review_helpful_votes }o--|| users : "user_id"
  client_review_appeals |o--|| client_reviews : "review_id"
  client_review_appeals }o--|| users : "appellant_id"
  assistant_memberships }o--|| users : "attorney_id"
  assistant_memberships }o--o| users : "assistant_user_id"
  assistant_activity }o--|| assistant_memberships : "membership_id"
  assistant_requests }o--|| assistant_memberships : "membership_id"
  attorney_tasks }o--|| users : "attorney_id"
  attorney_tasks }o--o| assistant_memberships : "created_by_membership_id"
  attorney_tasks }o--o| cases : "case_id"
  attorney_task_steps }o--|| attorney_tasks : "task_id"
  bid_drafts }o--|| users : "attorney_id"
  bid_drafts }o--|| cases : "case_id"
  assistant_liability_acceptances }o--|| users : "attorney_id"
  assistant_liability_acceptances }o--|| assistant_memberships : "membership_id"
  integration_credentials }o--o| users : "created_by"
  video_assets }o--|| users : "owner_user_id"
  sticker_packs }o--o| users : "owner_user_id"
  stickers }o--|| sticker_packs : "pack_id"
  stickers |o--|| files : "file_id"
  user_sticker_packs }o--|| users : "user_id"
  user_sticker_packs }o--|| sticker_packs : "pack_id"
  user_recent_stickers }o--|| users : "user_id"
  user_recent_stickers }o--|| stickers : "sticker_id"
  client_verifications |o--|| users : "user_id"
```
