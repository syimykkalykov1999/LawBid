# LawBid — ERD

Generated from `apps/api/prisma/schema.prisma` by
`npm run db:erd --workspace apps/api` (docs/02_DATABASE.md §8, stage
2.7). Do not edit by hand. Computed columns, partial / hash-sharded /
GIN indexes, CHECKs and DB roles live in raw-SQL migrations and are not
drawn here.

253 tables.

```mermaid
erDiagram
  users {
    String id PK
    enum_UserRole role "nullable"
    enum_UserStatus status
    String first_name "nullable"
    String last_name "nullable"
    String avatar_file_id FK "nullable"
    Int storage_quota_mb "nullable"
    String email UK "nullable"
    DateTime email_verified_at "nullable"
    String phone_e164 UK "nullable"
    DateTime phone_verified_at "nullable"
    String password_hash "nullable"
    DateTime password_set_at "nullable"
    String ui_language
    String timezone "nullable"
    Boolean notif_icon_badge
    Json notif_topics
    Boolean hide_like_counts
    enum_ThemePref theme
    String suspended_reason "nullable"
    DateTime last_active_at "nullable"
    Boolean show_activity_status
    Boolean find_by_phone
    DateTime contacts_announced_at "nullable"
    String feed_content_mode "nullable"
    DateTime deletion_requested_at "nullable"
    DateTime deleted_at "nullable"
    DateTime anonymized_at "nullable"
    String full_name_lower "nullable"
    String phone_sha256 "nullable"
    DateTime created_at
    DateTime updated_at
    String placeholder_kind "nullable"
    String country_code FK
    Int copyright_strikes
  }
  files {
    String id PK
    String owner_user_id FK
    enum_FilePurpose purpose
    String s3_bucket
    String s3_key
    String mime
    BigInt size_bytes
    String sha256
    String source_sha256 "nullable"
    Int width "nullable"
    Int height "nullable"
    enum_ScanStatus scan_status
    Boolean is_public
    DateTime deleted_at "nullable"
    String deleted_reason "nullable"
    DateTime purged_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  file_access_log {
    String id PK
    String file_id
    String owner_user_id
    String viewer_user_id
    String purpose
    String session_id "nullable"
    String ip "nullable"
    DateTime created_at
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
    String status
    Boolean requires_reacceptance
    String created_by "nullable"
    String changed_by "nullable"
    String change_note "nullable"
    String rollback_of_id "nullable"
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
  infra_change_requests {
    String id PK
    String item_id
    String from_state "nullable"
    String to_state
    Json changes
    String status
    String requested_by
    String confirmed_by "nullable"
    Json cost_delta_usd
    Boolean dry_run
    String rollback_of "nullable"
    Json plan_summary "nullable"
    Json file_before "nullable"
    String run_id "nullable"
    String run_url "nullable"
    String recorded "nullable"
    String error "nullable"
    DateTime planned_at "nullable"
    DateTime confirmed_at "nullable"
    DateTime finished_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  shard_map {
    Int logical_shard PK
    String physical_db
    String state
    Int version
    DateTime updated_at
  }
  cross_family_outbox {
    String id PK
    String event_type
    String idempotency_key UK
    Json payload
    String status
    Int attempts
    DateTime next_attempt_at
    String last_error "nullable"
    DateTime created_at
    DateTime processed_at "nullable"
  }
  cross_family_inbox {
    String idempotency_key PK
    String event_type
    DateTime applied_at
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
    Boolean admin_edited
  }
  i18n_bundle_versions {
    String lang PK,FK
    Int version
    DateTime updated_at
  }
  countries {
    String code PK
    String name
    Boolean is_enabled
    String calling_code
    String currency
    String language
    String region_kind
    String timezone "nullable"
    Boolean stripe_supported
    Int sort
    DateTime enabled_at "nullable"
    DateTime updated_at
  }
  country_waitlist {
    String id PK
    String country_code FK
    String email
    String locale
    DateTime created_at
    DateTime notified_at "nullable"
  }
  states {
    String code PK
    String name
    Boolean is_active
    String country_code FK
    String iso_code "nullable"
    Boolean attorney_advertising_label
  }
  case_extra_practices {
    String case_id PK,FK
    String practice_area_id PK,FK
    Int shard_id
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
    Int version
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
    Int version
    Boolean new_case_alerts_custom
    Boolean new_case_alerts_urgent_only
    Int assistant_seat_limit "nullable"
    Int trust_level
    Boolean trust_badge
  }
  attorney_licenses {
    String id PK
    String attorney_id FK
    String state_code FK
    String bar_number
    enum_LicenseStatus license_status
    DateTime expires_at "nullable"
    String expires_source "nullable"
    DateTime verified_at "nullable"
    String verified_by FK "nullable"
    Json auto_check_result "nullable"
    String rejection_code "nullable"
    String rejection_note "nullable"
    String registry_flag "nullable"
    DateTime registry_flagged_at "nullable"
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
    DateTime attested_at "nullable"
    String attestation_ip "nullable"
    String attestation_version "nullable"
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
    String private_details "nullable"
    String practice_area_id FK
    String inferred_practice_id "nullable"
    DateTime topic_scanned_at "nullable"
    String primary_state_code FK
    String city "nullable"
    enum_BudgetMode budget_mode
    Int budget_cents "nullable"
    Int budget_percent_bps "nullable"
    String cover_key "nullable"
    String urgency "nullable"
    DateTime deadline_at "nullable"
    String deadline_kind "nullable"
    enum_CaseStatus status
    String accepted_bid_id FK,UK "nullable"
    Int view_count
    Int bids_count
    Int comment_count
    Int share_count
    DateTime last_activity_at
    DateTime stale_prompt_sent_at "nullable"
    DateTime client_active_at
    DateTime paused_at "nullable"
    DateTime archived_at "nullable"
    DateTime client_completed_at "nullable"
    DateTime attorney_confirmed_at "nullable"
    DateTime auto_close_at "nullable"
    DateTime closed_at "nullable"
    DateTime deleted_at "nullable"
    tsvector search_tsv "nullable"
    tsvector search_tsv_simple "nullable"
    DateTime created_at
    DateTime updated_at
    Int version
    Int shard_id
  }
  case_states {
    String case_id PK,FK
    String state_code PK,FK
    Boolean is_primary
    Int shard_id
  }
  bids {
    String id PK
    String case_id FK
    String attorney_id FK
    enum_BidStatus status
    enum_FeeType fee_type
    Int amount_cents
    Int percent_bps "nullable"
    String message
    enum_StartAvailability start_availability
    DateTime start_date "nullable"
    Int estimated_duration_days "nullable"
    Int round_count
    enum_PartyRole turn
    Boolean outside_practice
    Boolean outside_licensed_states
    DateTime decided_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int version
    Int shard_id
  }
  bid_offers {
    String id PK
    String bid_id FK
    Int round_no
    enum_PartyRole from_role
    enum_FeeType fee_type
    Int amount_cents
    Int percent_bps "nullable"
    String message "nullable"
    enum_OfferStatus status
    DateTime created_at
    Int shard_id
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
    Int shard_id
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
    Int shard_id
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
    Int shard_id
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
    Int shard_id
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
    Int shard_id
  }
  posts {
    String id PK
    String author_id FK
    String body
    String title "nullable"
    String practice_area_id FK "nullable"
    String inferred_practice_id "nullable"
    DateTime topic_scanned_at "nullable"
    enum_PostKind kind
    String video_asset_id FK,UK "nullable"
    String language "nullable"
    String location_name "nullable"
    Float location_lat "nullable"
    Float location_lng "nullable"
    Boolean comments_enabled
    Boolean hide_likes
    Boolean hide_views
    String content_class
    Boolean content_class_locked
    enum_ContentStatus status
    Int like_count
    Int comment_count
    Int save_count
    Int share_count
    Int view_count
    Int pin_slot "nullable"
    String pin_group "nullable"
    DateTime edited_at "nullable"
    DateTime archived_at "nullable"
    DateTime deleted_at "nullable"
    tsvector search_tsv "nullable"
    tsvector search_tsv_simple "nullable"
    DateTime created_at
    Int created_shard
    DateTime updated_at
    Int shard_id
  }
  case_photos {
    String id PK
    String case_id FK
    String file_id FK
    Int position
    String description "nullable"
    String source
    String source_id "nullable"
    String source_item_id "nullable"
    Boolean is_sample
    String added_by "nullable"
    DateTime created_at
    Int shard_id
  }
  case_tasks {
    String id PK
    String case_id FK
    String kind
    String title
    String description "nullable"
    String created_by
    String status
    DateTime done_at "nullable"
    String done_by "nullable"
    DateTime closed_at "nullable"
    DateTime due_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  case_task_items {
    String id PK
    String task_id FK
    Int position
    String title
    DateTime done_at "nullable"
    String done_by "nullable"
    DateTime created_at
    Int shard_id
  }
  case_reads {
    String case_id PK
    String user_id PK
    DateTime updates_seen_at
    Int shard_id
  }
  case_task_events {
    String id PK
    String task_id FK
    String case_id
    String actor_id
    String type
    String note "nullable"
    Int file_count
    DateTime created_at
    Int shard_id
  }
  case_updates {
    String id PK
    String case_id FK
    String author_id
    String body
    DateTime created_at
    Int shard_id
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
    Int shard_id
  }
  post_attachments {
    String id PK
    String post_id FK
    String file_id FK,UK
    String file_name
    Int position
    DateTime created_at
    Int shard_id
  }
  tags {
    String id PK
    String tag_lower UK
    DateTime created_at
  }
  post_tags {
    String post_id PK,FK
    String tag_id PK,FK
    Int shard_id
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
    Int shard_id
  }
  post_likes {
    String post_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  post_reposts {
    String id PK
    String post_id FK
    String user_id FK
    DateTime created_at
    Int shard_id
  }
  comment_likes {
    String comment_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  follows {
    String follower_id PK,FK
    String followee_id PK,FK
    DateTime created_at
    Int shard_id
  }
  user_blocks {
    String blocker_id PK,FK
    String blocked_id PK,FK
    DateTime created_at
    Int shard_id
  }
  saved_items {
    String user_id PK,FK
    enum_SavedItemType item_type PK
    String item_id PK
    DateTime created_at
    Int shard_id
  }
  saved_chat_messages {
    String user_id PK,FK
    String message_id PK,FK
    enum_SavedChatKind kind
    DateTime created_at
    Int shard_id
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
    enum_ChatPairKind pair_kind
    DateTime last_message_at "nullable"
    Int disappear_after_s "nullable"
    String last_message_id "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  conversation_participants {
    String conversation_id PK,FK
    String user_id PK,FK
    String last_read_message_id "nullable"
    DateTime last_read_at "nullable"
    String last_delivered_message_id "nullable"
    DateTime last_delivered_at "nullable"
    DateTime muted_until "nullable"
    Boolean calls_muted
    enum_ChatFolder folder "nullable"
    DateTime waiting_since "nullable"
    String note "nullable"
    DateTime pinned_at "nullable"
    DateTime hidden_at "nullable"
    DateTime archived_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  calls {
    String id PK
    String conversation_id FK "nullable"
    String group_id "nullable"
    String channel_id "nullable"
    String caller_id FK
    String callee_id FK
    enum_CallStatus status
    DateTime answered_at "nullable"
    DateTime ended_at "nullable"
    Int duration_sec "nullable"
    String end_reason "nullable"
    Boolean video
    Boolean is_group
    DateTime solo_since "nullable"
    String media_provider
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  call_log_hidden {
    String user_id PK,FK
    String call_id PK,FK
    DateTime created_at
    Int shard_id
  }
  call_participants {
    String id PK
    String call_id FK
    String user_id FK
    String invited_by_id FK "nullable"
    String status
    Boolean muted
    Boolean muted_by_host
    DateTime invited_at
    DateTime joined_at "nullable"
    DateTime left_at "nullable"
    DateTime updated_at
    Int shard_id
  }
  call_votes {
    String id PK
    String call_id FK
    String target_id
    String started_by_id
    Json ballots
    String status
    DateTime expires_at
    DateTime created_at
    Int shard_id
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
    String gift_send_id FK "nullable"
    DateTime deleted_at "nullable"
    DateTime expires_at "nullable"
    DateTime edited_at "nullable"
    DateTime revoked_at "nullable"
    String reply_to_id FK "nullable"
    Boolean forwarded
    String forwarded_from_name "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  message_search_tokens {
    String conversation_id PK
    Bytes token PK
    String message_id PK
    DateTime created_at
  }
  message_hidden {
    String message_id PK,FK
    String user_id PK
    DateTime created_at
    Int shard_id
  }
  message_reactions {
    String message_id PK,FK
    String user_id PK
    String emoji
    DateTime created_at
    Int shard_id
  }
  message_edits {
    String id PK
    String message_id FK
    String body_original
    DateTime edited_at
    Int shard_id
  }
  message_pins {
    String message_id PK,FK
    String conversation_id
    String pinned_by
    DateTime pinned_at
    Int shard_id
  }
  chat_groups {
    String id PK
    String title
    String description "nullable"
    String avatar_file_id FK "nullable"
    String created_by FK
    enum_GroupType group_type
    String username "nullable"
    String username_lower UK "nullable"
    DateTime username_changed_at "nullable"
    Boolean join_approval
    Boolean topics_enabled
    String general_topic_id "nullable"
    String invite_code UK
    Boolean invite_enabled
    enum_GroupWho who_can_post
    enum_GroupWho who_can_add
    enum_GroupWho who_can_edit_info
    enum_GroupWho who_can_call
    Boolean show_service_messages
    Int disappear_after_s "nullable"
    Boolean protect_content
    enum_GroupWho who_can_media
    enum_GroupWho who_can_poll
    enum_GroupWho who_can_pin
    String pinned_message_id "nullable"
    String last_message_id "nullable"
    DateTime last_message_at "nullable"
    Int member_count
    DateTime deleted_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  chat_group_members {
    String group_id PK,FK
    String user_id PK,FK
    enum_ChatGroupRole role
    String added_by "nullable"
    DateTime joined_at
    DateTime left_at "nullable"
    String left_reason "nullable"
    String last_read_message_id "nullable"
    DateTime muted_until "nullable"
    Boolean calls_muted
    DateTime pinned_at "nullable"
    DateTime hidden_at "nullable"
    DateTime archived_at "nullable"
    DateTime updated_at
    Int shard_id
  }
  chat_group_messages {
    String id PK
    String group_id FK
    String sender_id FK "nullable"
    enum_GroupMessageType type
    String body
    String client_message_id
    String system_kind "nullable"
    Json system_payload "nullable"
    String topic_id FK "nullable"
    String reply_to_id FK "nullable"
    String file_id FK "nullable"
    String file_name "nullable"
    DateTime edited_at "nullable"
    DateTime deleted_at "nullable"
    DateTime expires_at "nullable"
    Boolean forwarded
    String forwarded_from_name "nullable"
    DateTime created_at
    Int shard_id
  }
  chat_group_topics {
    String id PK
    String group_id FK
    String title
    String icon_emoji "nullable"
    Int color
    Boolean is_general
    String created_by "nullable"
    DateTime closed_at "nullable"
    DateTime pinned_at "nullable"
    String last_message_id "nullable"
    DateTime last_message_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  chat_group_topic_reads {
    String topic_id PK,FK
    String user_id PK,FK
    String last_read_message_id "nullable"
    DateTime updated_at
    Int shard_id
  }
  chat_group_join_requests {
    String group_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  chat_group_invites {
    String id PK
    String group_id FK
    String invitee_id
    String inviter_id
    String status
    DateTime created_at
    DateTime responded_at "nullable"
    Int shard_id
  }
  chat_group_polls {
    String id PK
    String group_id FK
    String message_id FK,UK
    String creator_id FK
    String question
    Boolean multiple
    Boolean anonymous
    DateTime closed_at "nullable"
    String closed_by "nullable"
    DateTime created_at
    Int shard_id
  }
  chat_group_poll_options {
    String id PK
    String poll_id FK
    Int position
    String text
    Int shard_id
  }
  chat_group_poll_votes {
    String poll_id FK
    String option_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  notifications {
    String id PK
    String user_id FK
    enum_NotificationType type
    enum_NotificationCategory category
    Json payload
    DateTime read_at "nullable"
    DateTime created_at
    DateTime updated_at
    String dedupe_key "nullable"
    Int aggregate_count
    Int shard_id
  }
  notification_settings {
    String user_id PK,FK
    enum_NotificationCategory category PK
    Boolean push_enabled
    Boolean email_enabled
    DateTime updated_at
    Int shard_id
  }
  notification_quiet_hours {
    String user_id PK,FK
    DateTime start_time
    DateTime end_time
    String timezone
    DateTime updated_at
    Int shard_id
  }
  push_tokens {
    String id PK
    String user_id FK
    String session_id FK
    String fcm_token UK
    String platform
    Boolean local_reminders
    Boolean chat_style
    DateTime last_seen_at
    DateTime created_at
    Int shard_id
  }
  voip_tokens {
    String id PK
    String user_id FK
    String session_id FK
    String token UK
    String topic
    String environment
    DateTime last_seen_at
    DateTime created_at
    Int shard_id
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
    String plan_id FK "nullable"
    Json entitlements "nullable"
    DateTime created_at
    DateTime updated_at
  }
  payments {
    String id PK
    String user_id FK
    String stripe_invoice_id UK "nullable"
    String stripe_payment_intent_id "nullable"
    Int amount_cents
    Int tax_cents "nullable"
    Int subtotal_cents "nullable"
    String currency
    enum_PaymentStatus status
    DateTime paid_at "nullable"
    String failure_code "nullable"
    DateTime created_at
    DateTime updated_at
  }
  ledger_accounts {
    String id PK
    String code
    String owner_key
    String owner_id "nullable"
    String currency
    enum_LedgerAccountType type
    Int party_shard
    DateTime created_at
  }
  ledger_entries {
    String id PK
    String source_type
    String source_id
    String event
    String currency
    String description
    String stripe_ref "nullable"
    Int party_shard
    DateTime occurred_at
    DateTime created_at
  }
  ledger_lines {
    String id PK
    String entry_id FK
    String account_id FK
    enum_LedgerDirection direction
    Int amount_cents
    DateTime created_at
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
  dmca_notices {
    String id PK
    String report_id FK "nullable"
    enum_ReportTargetType target_type "nullable"
    String target_id "nullable"
    String infringing_url "nullable"
    String complainant_name
    String complainant_email
    String complainant_address
    String complainant_phone "nullable"
    String work_description
    Boolean good_faith
    Boolean accuracy_sworn
    String signature
    String status
    String submitted_by_user_id FK "nullable"
    String author_user_id "nullable"
    Json counter "nullable"
    String decided_by "nullable"
    DateTime decided_at "nullable"
    String decision_note "nullable"
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
  user_privacy_settings {
    String user_id PK,FK
    enum_PrivacyAudience last_seen
    enum_PrivacyAudience message_from
    enum_PrivacyAudience call_from
    enum_PrivacyAudience photo_from
    enum_PrivacyAudience about_from
    enum_PrivacyAudience group_add_from
    DateTime updated_at
  }
  moderation_appeals {
    String id PK
    String appellant_id FK
    String action_id FK,UK
    enum_ReportTargetType target_type
    String target_id
    String message
    enum_ModerationAppealStatus status
    String decided_by "nullable"
    DateTime decided_at "nullable"
    String decision_note "nullable"
    DateTime created_at
  }
  admin_profiles {
    String user_id PK,FK
    enum_AdminRole admin_role
    Json permissions
    Boolean on_call_enabled
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
  admin_approvals {
    String id PK
    String kind
    Json payload
    String payload_hash
    Int amount_cents
    String summary
    String status
    String requested_by FK
    String approved_by FK "nullable"
    String rejected_by FK "nullable"
    String decision_note "nullable"
    Json result "nullable"
    String error "nullable"
    DateTime created_at
    DateTime decided_at "nullable"
    DateTime executed_at "nullable"
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
  webauthn_credentials {
    String id PK
    String user_id FK
    String scope
    String credential_id UK
    Bytes public_key
    BigInt counter
    String device_type
    Boolean backed_up
    String aaguid "nullable"
    String name
    DateTime created_at
    DateTime last_used_at "nullable"
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
    Int shard_id
  }
  case_comment_likes {
    String comment_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  post_shares {
    String id PK
    String post_id FK
    String user_id FK
    DateTime created_at
    Int shard_id
  }
  post_views {
    String id PK
    String post_id FK
    String user_id FK
    DateTime created_at
    Int shard_id
  }
  post_view_events {
    String id PK
    String post_id FK
    String viewer_id FK "nullable"
    String kind
    DateTime created_at
    Int shard_id
  }
  case_shares {
    String id PK
    String case_id FK
    String user_id FK
    DateTime created_at
    Int shard_id
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
    Int shard_id
  }
  review_helpful_votes {
    String review_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  client_review_helpful_votes {
    String review_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
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
    Int shard_id
  }
  assistant_memberships {
    String id PK
    String attorney_id FK
    String assistant_user_id FK "nullable"
    String phone_e164 "nullable"
    String display_name "nullable"
    enum_AssistantStatus status
    String join_code_hash UK "nullable"
    String join_code_enc "nullable"
    DateTime join_code_expires_at "nullable"
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
    String assignee_membership_id FK "nullable"
    enum_AttorneyTaskKind kind
    String title
    String notes "nullable"
    DateTime due_at "nullable"
    String case_id FK "nullable"
    String conversation_id "nullable"
    String case_task_id "nullable"
    String consultation_id "nullable"
    enum_AttorneyTaskStatus status
    enum_AttorneyTaskPriority priority
    enum_AttorneyTaskRepeat repeat
    DateTime repeat_until "nullable"
    DateTime repeated_at "nullable"
    Int remind_before_min "nullable"
    DateTime remind_at "nullable"
    DateTime reminded_at "nullable"
    String outcome_note "nullable"
    DateTime rescheduled_to "nullable"
    DateTime done_at "nullable"
    DateTime archived_at "nullable"
    Boolean keep_forever
    Int purge_notice_days "nullable"
    DateTime created_at
    DateTime updated_at
    Int version
    Int shard_id
  }
  attorney_task_places {
    String id PK
    String task_id FK
    Int position
    String label "nullable"
    String address
    DateTime created_at
    Int shard_id
  }
  attorney_task_people {
    String id PK
    String task_id FK
    Int position
    String user_id FK "nullable"
    String role "nullable"
    String name
    String phone "nullable"
    String email "nullable"
    DateTime created_at
    Int shard_id
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
    Int shard_id
  }
  bid_drafts {
    String id PK
    String attorney_id FK
    String case_id FK
    Json payload
    String prepared_by_name "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  case_invites {
    String id PK
    String case_id FK
    String client_id FK
    String attorney_id FK
    String status
    String message "nullable"
    Int budget_cents "nullable"
    String decline_reason "nullable"
    Boolean outside_practice
    Boolean outside_licensed_states
    String bid_id "nullable"
    DateTime expires_at
    DateTime decided_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
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
  assistant_seat_changes {
    String id PK
    String user_id FK
    Int from_seats
    Int to_seats
    String stripe_invoice_id "nullable"
    Int amount_cents
    String currency
    enum_AssistantSeatChangeStatus status
    DateTime effective_at "nullable"
    DateTime created_at
    DateTime updated_at
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
    String slot
    String label "nullable"
    Int priority
    Boolean enabled
  }
  state_bar_registries {
    String state_code PK,FK
    String adapter
    Boolean enabled
    Json config
    String secret_enc "nullable"
    String secret_masked "nullable"
    String test_bar_number "nullable"
    DateTime last_test_at "nullable"
    Json last_test_result "nullable"
    String updated_by "nullable"
    DateTime created_at
    DateTime updated_at
  }
  attorney_trust {
    String attorney_id PK,FK
    Int level
    DateTime license_confirmed_at "nullable"
    String license_confirmed_by "nullable"
    String license_confirmed_note "nullable"
    DateTime documents_verified_at "nullable"
    String documents_verified_by "nullable"
    DateTime stripe_kyc_at "nullable"
    Boolean stripe_charges_enabled
    String stripe_legal_name "nullable"
    String stripe_business_type "nullable"
    String stripe_company_name "nullable"
    String stripe_company_domain "nullable"
    String stripe_representative "nullable"
    String name_check
    DateTime name_checked_at "nullable"
    String firm_link_status
    String firm_link_source "nullable"
    DateTime firm_link_at "nullable"
    String firm_link_note "nullable"
    String firm_email_domain "nullable"
    DateTime firm_email_verified_at "nullable"
    DateTime staff_cleared_at "nullable"
    String staff_cleared_by "nullable"
    String staff_cleared_note "nullable"
    DateTime documents_requested_at "nullable"
    String documents_requested_template "nullable"
    String payments_hold "nullable"
    DateTime payments_hold_at "nullable"
    String bids_hold "nullable"
    DateTime bids_hold_at "nullable"
    String hold_note "nullable"
    Int complaints_total
    Int duplicate_claims
    Int payout_delay_days "nullable"
    DateTime payout_delay_synced_at "nullable"
    DateTime computed_at
    DateTime created_at
    DateTime updated_at
  }
  attorney_trust_events {
    String id PK
    String attorney_id FK
    String kind
    Int from_level "nullable"
    Int to_level "nullable"
    String actor_type
    String actor_id "nullable"
    Json details
    DateTime created_at
  }
  bar_number_blocks {
    String id PK
    String state_code
    String bar_number
    String bar_key
    Boolean active
    String reason
    String source
    String attorney_id "nullable"
    String blocked_by "nullable"
    DateTime blocked_at
    Boolean block_contacts
    String email_lower "nullable"
    String phone_e164 "nullable"
    DateTime unblocked_at "nullable"
    String unblocked_by "nullable"
    String unblock_reason "nullable"
    Int attempts
    DateTime last_attempt_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  bar_number_block_events {
    String id PK
    String block_id FK
    String kind
    String actor_type
    String actor_id "nullable"
    String reason "nullable"
    Json details
    DateTime created_at
  }
  integration_custom_providers {
    String id PK
    String label
    String description
    Json fields
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
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
    Int trim_start_ms "nullable"
    Int trim_end_ms "nullable"
    Int cover_time_ms "nullable"
    String cover_file_id "nullable"
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
  seat_limit_requests {
    String id PK
    String attorney_id
    Int requested_seats
    String note "nullable"
    String status
    Int granted_seats "nullable"
    String decision_note "nullable"
    String decided_by "nullable"
    DateTime decided_at "nullable"
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
    DateTime archived_at "nullable"
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
    String admin_id "nullable"
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
  partners {
    String id PK
    String user_id UK
    String status
    String label "nullable"
    String note "nullable"
    Int attorney_rate_cents "nullable"
    Int client_rate_cents "nullable"
    Int monthly_base_cents
    String client_rule "nullable"
    Int hold_days "nullable"
    String created_by "nullable"
    String external_name "nullable"
    String external_contact "nullable"
    Boolean demo_access
    DateTime created_at
    DateTime updated_at
    DateTime ended_at "nullable"
    DateTime terms_accepted_at "nullable"
    String terms_version "nullable"
    String terms_ip "nullable"
    DateTime w9_received_at "nullable"
  }
  partner_commissions {
    String id PK
    String partner_id FK
    String partner_user_id
    String referral_id "nullable"
    String referred_user_id "nullable"
    String kind
    Int amount_cents
    String status
    String event_ref UK
    String period
    DateTime hold_until "nullable"
    DateTime approved_at "nullable"
    String approved_by "nullable"
    DateTime paid_at "nullable"
    String paid_by "nullable"
    String payout_ref "nullable"
    DateTime reversed_at "nullable"
    String reversed_reason "nullable"
    String note "nullable"
    DateTime created_at
    DateTime updated_at
  }
  outreach_leads {
    String id PK
    String kind
    String first_name "nullable"
    String last_name "nullable"
    String company "nullable"
    String state_code "nullable"
    String city "nullable"
    String practice "nullable"
    String phone UK "nullable"
    String email UK "nullable"
    String source
    String source_ref "nullable"
    String status
    String partner_id FK "nullable"
    String converted_user_id "nullable"
    String unsubscribe_token UK
    DateTime unsubscribed_at "nullable"
    DateTime last_activity_at "nullable"
    DateTime next_action_at "nullable"
    String note "nullable"
    DateTime do_not_contact_at "nullable"
    String do_not_contact_reason "nullable"
    String source_note "nullable"
    Int emails_sent
    DateTime last_email_at "nullable"
    String created_by
    DateTime created_at
    DateTime updated_at
  }
  outreach_activities {
    String id PK
    String lead_id FK
    String partner_id "nullable"
    String actor_admin_id "nullable"
    String kind
    String outcome "nullable"
    String body "nullable"
    Json meta "nullable"
    DateTime created_at
  }
  outreach_templates {
    String id PK
    String name
    String kind
    String subject
    String body
    Boolean active
    String created_by
    DateTime created_at
    DateTime updated_at
  }
  outreach_suppressions {
    String id PK
    String kind
    String value
    String note "nullable"
    String created_by
    DateTime created_at
  }
  case_promotions {
    String id PK
    String target_type
    String case_id "nullable"
    String post_id "nullable"
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
    Int cpm_cents "nullable"
    Int target_impressions "nullable"
    Int reach
    Int clicks
    Json audience "nullable"
    String goal "nullable"
    String cta_type "nullable"
    String cta_value "nullable"
    Int refunded_cents
    Int paid_stars
    Int refunded_stars
    String reviewed_by "nullable"
    DateTime reviewed_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  promotion_daily {
    String promotion_id PK,FK
    String day_key PK
    Int impressions
    Int reach
    Int clicks
  }
  promotion_views {
    String promotion_id PK,FK
    String user_id PK
    Int impressions
    String day_key
    Int day_count
    Boolean clicked
    DateTime first_seen_at
    DateTime last_seen_at
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
    DateTime assigned_at "nullable"
    DateTime first_response_at "nullable"
    String first_response_by "nullable"
    String resolved_by "nullable"
    DateTime sla_due_at "nullable"
    DateTime sla_breached_at "nullable"
    String country_code
    Json client_context "nullable"
  }
  support_messages {
    String id PK
    String ticket_id
    String author_user_id "nullable"
    String author_admin_id "nullable"
    Boolean internal
    Boolean auto
    String body
    DateTime created_at
  }
  support_message_files {
    String id PK
    String message_id FK
    String file_id FK,UK
    String name
    Int position
    DateTime created_at
  }
  support_macros {
    String id PK
    String title
    String body
    String body_ru "nullable"
    String category "nullable"
    Boolean active
    Int uses
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
  }
  support_agents {
    String admin_id PK
    Boolean on_shift
    Int max_open
    DateTime updated_at
  }
  staff_rewards {
    String id PK
    String period
    String department
    String admin_id
    Int rank
    Int score
    String prize
    Int bonus_cents
    String currency
    String accrual_id "nullable"
    Boolean auto
    String created_by "nullable"
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
    Int price_stars
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
    Int shard_id
  }
  user_recent_stickers {
    String user_id PK,FK
    String sticker_id PK,FK
    DateTime used_at
    Int shard_id
  }
  star_wallets {
    String user_id PK
    Int balance
    Int lifetime_bought
    Int lifetime_spent
    Int debt
    DateTime updated_at
  }
  star_ledger {
    String id PK
    String user_id
    Int delta
    Int balance_after
    String kind
    String ref_id "nullable"
    String note "nullable"
    String idem_key UK
    DateTime created_at
  }
  star_purchases {
    String id PK
    String user_id
    String pack_id
    Int stars
    Int price_cents
    String status
    String stripe_checkout_id UK "nullable"
    String payment_id "nullable"
    DateTime created_at
    DateTime paid_at "nullable"
    DateTime refunded_at "nullable"
  }
  gifts {
    String id PK
    String title
    Int price_stars
    String code "nullable"
    String file_id FK,UK
    Int position
    String status
    Int sent_count
    DateTime created_at
    DateTime deleted_at "nullable"
  }
  gift_sends {
    String id PK
    String gift_id FK
    String sender_id
    String recipient_id
    String conversation_id "nullable"
    Int price_stars
    String note "nullable"
    Boolean anonymous
    Boolean shown
    Int converted_stars "nullable"
    DateTime converted_at "nullable"
    DateTime created_at
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
  plan_prices {
    String id PK
    String kind
    Int amount_cents
    String currency
    Boolean active
    Json stripe_price_ids
    Json stripe_product_ids
    String note "nullable"
    Int compare_at_cents "nullable"
    Boolean show_discount
    String created_by "nullable"
    DateTime created_at
  }
  payroll_employees {
    String id PK
    String admin_user_id "nullable"
    String user_id UK "nullable"
    String name
    String role_title
    Int amount_cents
    String currency
    String method_note
    String email "nullable"
    String stripe_account_id "nullable"
    Boolean stripe_payouts_enabled
    Boolean active
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
  }
  payroll_payouts {
    String id PK
    String employee_id FK
    String batch_id
    String period
    Int amount_cents
    String currency
    String method
    String status
    Int base_cents
    Int commission_cents
    Int fee_cents
    Int net_cents
    String transfer_id "nullable"
    String failure "nullable"
    String note "nullable"
    String cancel_reason "nullable"
    String created_by "nullable"
    DateTime created_at
    DateTime canceled_at "nullable"
  }
  payroll_accruals {
    String id PK
    String employee_id FK
    String source
    String kind
    String event_ref UK
    Int amount_cents
    String currency
    String period
    String note "nullable"
    String status
    String payout_id "nullable"
    DateTime created_at
    DateTime paid_at "nullable"
    DateTime canceled_at "nullable"
  }
  treasury_expenses {
    String id PK
    String name
    Int monthly_cents
    String source
    Boolean active
    Int sort
    DateTime created_at
    DateTime updated_at
  }
  treasury_payouts {
    String id PK
    String key UK
    String period
    String kind
    String trigger
    Int amount_cents
    String currency
    String destination_id "nullable"
    String destination_label "nullable"
    String stripe_payout_id "nullable"
    String status
    String failure "nullable"
    Json plan "nullable"
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
  }
  payout_accounts {
    String user_id PK
    String provider
    String stripe_account_id UK
    String status
    Boolean charges_enabled
    Boolean payouts_enabled
    Boolean details_submitted
    String disabled_reason "nullable"
    String country "nullable"
    String processing_fee_payer "nullable"
    DateTime last_synced_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  case_payments {
    String id PK
    String case_id
    String bid_id "nullable"
    String client_id
    String attorney_id
    String kind
    String request_id "nullable"
    String status
    Int amount_cents
    Int platform_fee_cents
    Int processing_fee_cents
    Int client_total_cents
    Int attorney_net_cents
    String fee_type
    String fee_payer
    String processing_fee_payer
    String currency
    String note "nullable"
    String stripe_account_id "nullable"
    String stripe_checkout_id UK "nullable"
    String stripe_payment_intent_id UK "nullable"
    String stripe_charge_id "nullable"
    String receipt_url "nullable"
    Int refunded_cents
    String dispute_status "nullable"
    DateTime disputed_at "nullable"
    DateTime paid_at "nullable"
    String canceled_reason "nullable"
    String failure_code "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  payment_requests {
    String id PK
    String case_id
    String attorney_id
    String client_id
    String created_by
    Int amount_cents
    String description
    DateTime due_at "nullable"
    String processing_fee_payer
    String fee_payer_status
    String fee_payer_by
    Int fee_payer_rounds
    DateTime fee_payer_agreed_at "nullable"
    String status
    String plan_id "nullable"
    Int seq
    Int total
    String payment_id UK "nullable"
    DateTime paid_at "nullable"
    DateTime canceled_at "nullable"
    DateTime last_reminded_at "nullable"
    Int reminders_sent
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  connected_customers {
    String client_id PK
    String stripe_account_id PK
    String stripe_customer_id
    DateTime created_at
  }
  case_payment_refunds {
    String id PK
    String payment_id
    Int amount_cents
    String reason
    String initiated_by_type
    String initiated_by "nullable"
    String stripe_refund_id UK "nullable"
    String status
    String failure_reason "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  document_templates {
    String id PK
    String file_id FK,UK
    String file_name
    String title
    String description
    String practice_area_id FK "nullable"
    String state "nullable"
    String language
    enum_DocumentTemplateAudience audience
    Boolean is_published
    Int download_count
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
    DateTime deleted_at "nullable"
  }
  plans {
    String id PK
    String code UK
    String audience
    String kind
    Json name
    Json tagline
    Json description
    String interval "nullable"
    String price_kind "nullable"
    Json entitlements
    Json highlights
    String status
    Int sort
    Boolean is_default
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
  }
  client_subscriptions {
    String id PK
    String user_id FK,UK
    String plan_id FK "nullable"
    String stripe_checkout_id "nullable"
    String stripe_subscription_id UK "nullable"
    String status
    Int price_cents
    DateTime trial_ends_at "nullable"
    DateTime current_period_end "nullable"
    Boolean cancel_at_period_end
    DateTime canceled_at "nullable"
    Json entitlements "nullable"
    DateTime created_at
    DateTime updated_at
  }
  demo_accounts {
    String id PK
    String demo_user_id UK
    String role
    String display_name
    String label "nullable"
    String created_by_user_id "nullable"
    String created_by_admin_id "nullable"
    String invite_code_hash UK "nullable"
    DateTime invite_expires_at "nullable"
    DateTime last_seen_at "nullable"
    DateTime created_at
    DateTime updated_at
  }
  storage_snapshots {
    String id PK
    DateTime day UK
    BigInt files_bytes
    BigInt stored_bytes
    Int files_count
    Json by_purpose
    Json db_tables
    BigInt db_bytes
    DateTime created_at
  }
  identity_fingerprints {
    String id PK
    String user_id
    String kind
    String hash
    DateTime first_seen_at
    DateTime last_seen_at
    DateTime banned_at "nullable"
  }
  client_fraud_profiles {
    String user_id PK
    Int score
    String status
    Json signals
    String linked_user_id "nullable"
    String queue_reason "nullable"
    DateTime queued_at "nullable"
    Int cleared_score "nullable"
    String cleared_by "nullable"
    DateTime cleared_at "nullable"
    DateTime computed_at
    DateTime created_at
    DateTime updated_at
  }
  client_fraud_events {
    String id PK
    String user_id "nullable"
    String kind
    String actor_type
    String actor_id "nullable"
    String note "nullable"
    Json details
    DateTime created_at
  }
  country_partners {
    String id PK
    String country_code
    String name
    String contact "nullable"
    String lead_admin_id UK
    Int share_bps
    String status
    Int max_admins
    Boolean payouts_enabled
    String payroll_employee_id "nullable"
    DateTime contract_starts_at "nullable"
    DateTime contract_ends_at "nullable"
    Int contract_version "nullable"
    DateTime contract_accepted_at "nullable"
    String contract_accepted_ip "nullable"
    Json goals
    String note "nullable"
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
    DateTime disabled_at "nullable"
    DateTime contract_expired_at "nullable"
  }
  country_partner_settlements {
    String id PK
    String partner_id FK
    String period
    String currency
    Int gross_cents
    Int refunds_cents
    Int fees_cents
    Int net_cents
    Int share_bps
    Int amount_cents
    String status
    String accrual_ref "nullable"
    DateTime created_at
    DateTime updated_at
  }
  contact_matches {
    String owner_id PK,FK
    String matched_id PK,FK
    DateTime created_at
    Int shard_id
  }
  contact_sync_settings {
    String user_id PK,FK
    Boolean enabled
    DateTime synced_at "nullable"
    String book_hash "nullable"
    Int book_size
    Int matches_version
    Boolean notify_joined
    Int shard_id
  }
  contact_book_hashes {
    String owner_id PK,FK
    String phone_hash PK
    Boolean peppered
    DateTime created_at
    Int shard_id
  }
  attorney_profile_views {
    String attorney_id PK
    DateTime day PK
    Int views
  }
  bid_pack_purchases {
    String id PK
    String user_id
    String pack_id
    Int bids
    Int price_cents
    String status
    String stripe_checkout_id UK "nullable"
    String payment_id "nullable"
    DateTime created_at
    DateTime paid_at "nullable"
  }
  bid_credits {
    String user_id PK
    Int balance
    DateTime updated_at
  }
  firms {
    String id PK
    String name
    String owner_id
    DateTime created_at
  }
  firm_members {
    String firm_id PK,FK
    String attorney_id PK,UK
    String role
    String status
    DateTime created_at
  }
  search_synonym_groups {
    String id PK
    String key UK
    String practice_area_id FK "nullable"
    Boolean enabled
    String source
    DateTime created_at
    DateTime updated_at
  }
  search_synonym_terms {
    String id PK
    String group_id FK
    String lang
    String term
  }
  search_query_log {
    BigInt id PK
    String user_id "nullable"
    String q
    String scope
    String lang "nullable"
    Int results
    DateTime created_at
  }
  search_clicks {
    BigInt id PK
    String user_id
    String q
    String target_type
    String target_id
    String practice_area_id "nullable"
    DateTime created_at
  }
  search_learned_links {
    String q PK
    String practice_area_id PK
    Int score
    DateTime updated_at
  }
  app_event_days {
    DateTime day PK
    String name PK
    String screen PK
    Int count
  }
  crash_reports {
    String id PK
    String fingerprint
    String message
    String stack
    Boolean fatal
    String platform
    String app_version
    String build
    String flavor
    String os_version
    String device_model
    String device_key "nullable"
    String route "nullable"
    DateTime created_at
  }
  user_activity_days {
    String user_id PK
    DateTime day PK
  }
  bar_format_misses {
    String id PK
    String state_code
    String shape
    Int hits
    DateTime first_seen
    DateTime last_seen
  }
  stories {
    String id PK
    String author_id FK
    String kind
    String file_id FK "nullable"
    String video_asset_id FK,UK "nullable"
    String text "nullable"
    String background "nullable"
    Json overlays
    String audience
    String status
    Int view_count
    DateTime created_at
    DateTime expires_at
    DateTime deleted_at "nullable"
    Int shard_id
  }
  story_views {
    String story_id PK,FK
    String viewer_id PK,FK
    DateTime viewed_at
    Int shard_id
  }
  story_hidden {
    String owner_id PK,FK
    String hidden_user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  story_settings {
    String user_id PK,FK
    String audience
    Boolean allow_replies
    DateTime updated_at
    Int shard_id
  }
  channels {
    String id PK
    String owner_id FK
    String title
    String username UK
    DateTime username_changed_at "nullable"
    String description "nullable"
    String avatar_file_id FK "nullable"
    Boolean comments_enabled
    Boolean protect_content
    String status
    String moderation_note "nullable"
    Int subscriber_count
    Int post_count
    DateTime last_post_at "nullable"
    DateTime created_at
    DateTime updated_at
    DateTime deleted_at "nullable"
    Int shard_id
  }
  channel_admins {
    String channel_id PK,FK
    String user_id PK,FK
    String role
    DateTime created_at
    Int shard_id
  }
  channel_subscriptions {
    String channel_id PK,FK
    String user_id PK,FK
    Boolean muted
    DateTime muted_until "nullable"
    DateTime pinned_at "nullable"
    DateTime archived_at "nullable"
    DateTime created_at
    Int shard_id
  }
  channel_posts {
    String id PK
    String channel_id FK
    String author_id FK
    String body
    String video_asset_id FK,UK "nullable"
    String status
    Int view_count
    Int comment_count
    Int share_count
    String forwarded_from_name "nullable"
    String forward_key "nullable"
    DateTime created_at
    DateTime edited_at "nullable"
    DateTime deleted_at "nullable"
    Int shard_id
  }
  channel_post_views {
    String post_id PK,FK
    String user_id PK
    DateTime viewed_at
    Int shard_id
  }
  channel_post_shares {
    String id PK
    String post_id FK
    String user_id
    DateTime created_at
    Int shard_id
  }
  channel_reactions {
    String post_id PK,FK
    String user_id PK,FK
    String emoji
    DateTime created_at
    Int shard_id
  }
  channel_comments {
    String id PK
    String post_id FK
    String author_id FK
    String body
    DateTime created_at
    DateTime deleted_at "nullable"
    Int shard_id
  }
  case_billing {
    String case_id PK
    String attorney_id
    Int hourly_rate_cents
    String currency
    DateTime updated_at
    Int shard_id
  }
  case_time_entries {
    String id PK
    String case_id FK
    String attorney_id
    DateTime worked_on
    Int minutes
    DateTime running_since "nullable"
    String note
    Int rate_cents
    String invoice_id "nullable"
    DateTime created_at
    DateTime updated_at
    DateTime deleted_at "nullable"
    Int shard_id
  }
  case_expenses {
    String id PK
    String case_id FK
    String attorney_id
    DateTime spent_on
    String description
    Int amount_cents
    String receipt_file_id FK "nullable"
    String invoice_id "nullable"
    DateTime created_at
    DateTime deleted_at "nullable"
    Int shard_id
  }
  case_invoices {
    String id PK
    String case_id FK
    String attorney_id
    String client_id
    Int seq
    String number
    String currency
    Int minutes
    Int time_cents
    Int expenses_cents
    Int total_cents
    String note "nullable"
    Json lines
    String file_id
    DateTime created_at
    Int shard_id
  }
  case_sign_requests {
    String id PK
    String case_id FK
    String created_by
    String title
    String source_file_id
    String source_sha256
    enum_CaseSignStatus status
    String final_file_id "nullable"
    String final_sha256 "nullable"
    String declined_by "nullable"
    String decline_reason "nullable"
    DateTime completed_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  case_signatures {
    String id PK
    String request_id FK
    String signer_id
    String signer_role
    String signed_name
    String method
    Bytes image_png "nullable"
    String doc_sha256
    String ip "nullable"
    String user_agent "nullable"
    DateTime signed_at
    Int shard_id
  }
  form_templates {
    String id PK
    String slug UK
    Json title
    Json description
    Json body
    Json fields
    String practice_area_id FK "nullable"
    Int position
    Boolean is_published
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
    DateTime deleted_at "nullable"
  }
  case_conflict_checks {
    String id PK
    String case_id
    String attorney_id
    String trigger
    String bid_id "nullable"
    Json matches
    DateTime created_at
    Int shard_id
  }
  consultation_settings {
    String attorney_id PK,FK
    Boolean enabled
    Int slot_minutes
    Int buffer_minutes
    Int min_notice_hours
    Int horizon_days
    Boolean auto_confirm
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  consultation_windows {
    String id PK
    String attorney_id FK
    Int weekday
    Int start_minute
    Int end_minute
    DateTime created_at
    Int shard_id
  }
  consultation_time_off {
    String id PK
    String attorney_id FK
    DateTime starts_on
    DateTime ends_on
    String note "nullable"
    DateTime created_at
    Int shard_id
  }
  consultations {
    String id PK
    String attorney_id FK
    String client_id FK
    DateTime starts_at
    DateTime ends_at
    enum_ConsultationStatus status
    String note "nullable"
    String case_id "nullable"
    String conversation_id "nullable"
    DateTime confirmed_at "nullable"
    String cancelled_by_id "nullable"
    String cancel_reason "nullable"
    DateTime rescheduled_at "nullable"
    DateTime reminded_day_at "nullable"
    DateTime reminded_hour_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  legal_questions {
    String id PK
    String author_id FK
    String practice_area_id FK "nullable"
    String state_code FK "nullable"
    String title
    String body
    Boolean is_anonymous
    enum_ContentStatus status
    Int answer_count
    String best_answer_id "nullable"
    DateTime deleted_at "nullable"
    DateTime closed_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  legal_answers {
    String id PK
    String question_id FK
    String attorney_id FK
    String body
    enum_ContentStatus status
    Int like_count
    Boolean is_best
    DateTime deleted_at "nullable"
    DateTime created_at
    DateTime updated_at
    Int shard_id
  }
  legal_answer_likes {
    String answer_id PK,FK
    String user_id PK,FK
    DateTime created_at
    Int shard_id
  }
  deadline_rules {
    String id PK
    String jurisdiction
    enum_DeadlineKind kind
    String code UK
    Json labels
    Int amount
    enum_DeadlineUnit unit
    enum_DeadlineDayType day_type
    enum_DeadlineDirection direction
    String practice_code "nullable"
    String citation "nullable"
    Json notes "nullable"
    String source_url "nullable"
    Boolean verified
    Boolean is_active
    Int sort
    DateTime created_at
    DateTime updated_at
  }
  court_holidays {
    String id PK
    String jurisdiction
    DateTime date
    Json names
    DateTime created_at
    DateTime updated_at
  }
  usernames {
    String username_lower PK
    String owner_type
    String owner_id
    String skeleton
    DateTime created_at
  }
  username_holds {
    String username_lower PK
    String holder_user_id
    DateTime released_at
  }
  legal_exports {
    String id PK
    String request_id FK
    String subject_user_id
    String requested_by
    String status
    Json selection
    String file_bucket "nullable"
    String file_key "nullable"
    BigInt size_bytes "nullable"
    String sha256 "nullable"
    Json row_counts "nullable"
    String error "nullable"
    DateTime created_at
    DateTime started_at "nullable"
    DateTime finished_at "nullable"
    DateTime expires_at "nullable"
  }
  legal_holds {
    String id PK
    String request_id FK
    String target_type
    String target_id
    String created_by
    DateTime created_at
    DateTime expires_at "nullable"
    DateTime released_at "nullable"
  }
  media_moderation_checks {
    String id PK
    String file_id UK "nullable"
    String video_asset_id UK "nullable"
    String owner_user_id
    String purpose
    String content_sha256 "nullable"
    String status
    String csam_status
    String provider "nullable"
    Json labels
    Float max_confidence "nullable"
    String top_label "nullable"
    String skip_reason "nullable"
    String error "nullable"
    Json hidden_targets
    String decision "nullable"
    String decided_by "nullable"
    DateTime decided_at "nullable"
    DateTime created_at
    DateTime checked_at "nullable"
  }
  csam_reports {
    String id PK
    String check_id FK
    String status
    String provider
    String external_report_id "nullable"
    String error "nullable"
    String created_by "nullable"
    DateTime created_at
    DateTime submitted_at "nullable"
  }
  system_incidents {
    String id PK
    String component
    String severity
    String title
    Json detail
    DateTime opened_at
    DateTime closed_at "nullable"
    DateTime last_notified_at "nullable"
    Int notify_count
  }
  search_outbox {
    BigInt id PK
    String entity
    String entity_id
    DateTime created_at
    Int attempts
    DateTime next_attempt_at
    String last_error "nullable"
    DateTime failed_at "nullable"
  }
  search_index_state {
    String key PK
    Json value
    DateTime updated_at
  }
  experiments {
    String id PK
    String key UK
    String name
    String hypothesis "nullable"
    String surface
    String status
    Json variants
    Int traffic_percent
    Json guardrails
    DateTime start_at "nullable"
    DateTime end_at "nullable"
    DateTime started_at "nullable"
    DateTime stopped_at "nullable"
    String stop_reason "nullable"
    Boolean stopped_by_system
    String created_by "nullable"
    DateTime created_at
    DateTime updated_at
  }
  experiment_exposures {
    String experiment_id PK,FK
    String unit_id PK
    String variant
    DateTime first_at
  }
  experiment_results {
    String id PK
    String experiment_id FK
    DateTime computed_at
    Float srm_p "nullable"
    Boolean srm_flag
    Boolean guardrail_tripped
    Json payload
  }
  ranking_events {
    BigInt id PK
    DateTime created_at PK
    String kind
    String user_id "nullable"
    String surface
    String item_id "nullable"
    String list_id "nullable"
    Int position "nullable"
    String formula_version "nullable"
    String experiment_key "nullable"
    String variant "nullable"
    Int value "nullable"
    Json features "nullable"
  }
  users }o--o| files : "avatar_file_id"
  users }o--|| countries : "country_code"
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
  country_waitlist }o--|| countries : "country_code"
  states }o--|| countries : "country_code"
  case_extra_practices }o--|| cases : "case_id"
  case_extra_practices }o--|| practice_areas : "practice_area_id"
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
  case_tasks }o--|| cases : "case_id"
  case_task_items }o--|| case_tasks : "task_id"
  case_task_events }o--|| case_tasks : "task_id"
  case_updates }o--|| cases : "case_id"
  post_media }o--|| posts : "post_id"
  post_media }o--|| files : "file_id"
  post_attachments }o--|| posts : "post_id"
  post_attachments |o--|| files : "file_id"
  post_tags }o--|| posts : "post_id"
  post_tags }o--|| tags : "tag_id"
  comments }o--|| posts : "post_id"
  comments }o--|| users : "author_id"
  comments }o--o| comments : "parent_comment_id"
  post_likes }o--|| posts : "post_id"
  post_likes }o--|| users : "user_id"
  post_reposts }o--|| posts : "post_id"
  post_reposts }o--|| users : "user_id"
  comment_likes }o--|| comments : "comment_id"
  comment_likes }o--|| users : "user_id"
  follows }o--|| users : "follower_id"
  follows }o--|| users : "followee_id"
  user_blocks }o--|| users : "blocker_id"
  user_blocks }o--|| users : "blocked_id"
  saved_items }o--|| users : "user_id"
  saved_chat_messages }o--|| users : "user_id"
  saved_chat_messages }o--|| messages : "message_id"
  conversations }o--o| cases : "case_id"
  conversations }o--|| users : "attorney_id"
  conversations }o--|| users : "client_id"
  conversations }o--o| bids : "bid_id"
  conversations }o--o| users : "requested_by"
  conversation_participants }o--|| conversations : "conversation_id"
  conversation_participants }o--|| users : "user_id"
  calls }o--o| conversations : "conversation_id"
  calls }o--|| users : "caller_id"
  calls }o--|| users : "callee_id"
  call_log_hidden }o--|| users : "user_id"
  call_log_hidden }o--|| calls : "call_id"
  call_participants }o--|| calls : "call_id"
  call_participants }o--|| users : "user_id"
  call_participants }o--o| users : "invited_by_id"
  call_votes }o--|| calls : "call_id"
  messages }o--|| conversations : "conversation_id"
  messages }o--o| users : "sender_id"
  messages }o--o| files : "file_id"
  messages }o--o| stickers : "sticker_id"
  messages }o--o| gift_sends : "gift_send_id"
  messages }o--o| messages : "reply_to_id"
  message_hidden }o--|| messages : "message_id"
  message_reactions }o--|| messages : "message_id"
  message_edits }o--|| messages : "message_id"
  message_pins |o--|| messages : "message_id"
  chat_groups }o--o| files : "avatar_file_id"
  chat_groups }o--|| users : "created_by"
  chat_group_members }o--|| chat_groups : "group_id"
  chat_group_members }o--|| users : "user_id"
  chat_group_messages }o--|| chat_groups : "group_id"
  chat_group_messages }o--o| users : "sender_id"
  chat_group_messages }o--o| chat_group_topics : "topic_id"
  chat_group_messages }o--o| chat_group_messages : "reply_to_id"
  chat_group_messages }o--o| files : "file_id"
  chat_group_topics }o--|| chat_groups : "group_id"
  chat_group_topic_reads }o--|| chat_group_topics : "topic_id"
  chat_group_topic_reads }o--|| users : "user_id"
  chat_group_join_requests }o--|| chat_groups : "group_id"
  chat_group_join_requests }o--|| users : "user_id"
  chat_group_invites }o--|| chat_groups : "group_id"
  chat_group_polls }o--|| chat_groups : "group_id"
  chat_group_polls |o--|| chat_group_messages : "message_id"
  chat_group_polls }o--|| users : "creator_id"
  chat_group_poll_options }o--|| chat_group_polls : "poll_id"
  chat_group_poll_votes }o--|| chat_group_polls : "poll_id"
  chat_group_poll_votes }o--|| chat_group_poll_options : "option_id"
  chat_group_poll_votes }o--|| users : "user_id"
  notifications }o--|| users : "user_id"
  notification_settings }o--|| users : "user_id"
  notification_quiet_hours |o--|| users : "user_id"
  push_tokens }o--|| users : "user_id"
  push_tokens }o--|| sessions : "session_id"
  voip_tokens }o--|| users : "user_id"
  voip_tokens }o--|| sessions : "session_id"
  stripe_customers |o--|| users : "user_id"
  subscriptions |o--|| users : "user_id"
  subscriptions }o--o| plans : "plan_id"
  payments }o--|| users : "user_id"
  ledger_lines }o--|| ledger_entries : "entry_id"
  ledger_lines }o--|| ledger_accounts : "account_id"
  reports }o--|| users : "reporter_id"
  reports }o--o| users : "handled_by"
  dmca_notices }o--o| reports : "report_id"
  dmca_notices }o--o| users : "submitted_by_user_id"
  moderation_actions }o--o| reports : "report_id"
  moderation_actions }o--|| users : "admin_id"
  user_privacy_settings |o--|| users : "user_id"
  moderation_appeals }o--|| users : "appellant_id"
  moderation_appeals |o--|| moderation_actions : "action_id"
  admin_profiles |o--|| users : "user_id"
  audit_log }o--|| users : "admin_id"
  data_access_requests }o--|| users : "handled_by"
  data_access_log }o--|| data_access_requests : "request_id"
  data_access_log }o--|| users : "admin_id"
  admin_approvals }o--|| users : "requested_by"
  admin_approvals }o--o| users : "approved_by"
  admin_approvals }o--o| users : "rejected_by"
  admin_credentials |o--|| users : "user_id"
  webauthn_credentials }o--|| users : "user_id"
  data_export_jobs }o--|| users : "user_id"
  data_export_jobs }o--o| files : "file_id"
  case_comments }o--|| cases : "case_id"
  case_comments }o--|| users : "author_id"
  case_comments }o--o| case_comments : "parent_comment_id"
  case_comment_likes }o--|| case_comments : "comment_id"
  case_comment_likes }o--|| users : "user_id"
  post_shares }o--|| posts : "post_id"
  post_shares }o--|| users : "user_id"
  post_views }o--|| posts : "post_id"
  post_views }o--|| users : "user_id"
  post_view_events }o--|| posts : "post_id"
  post_view_events }o--o| users : "viewer_id"
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
  attorney_tasks }o--o| assistant_memberships : "assignee_membership_id"
  attorney_tasks }o--o| cases : "case_id"
  attorney_task_places }o--|| attorney_tasks : "task_id"
  attorney_task_people }o--|| attorney_tasks : "task_id"
  attorney_task_people }o--o| users : "user_id"
  attorney_task_steps }o--|| attorney_tasks : "task_id"
  bid_drafts }o--|| users : "attorney_id"
  bid_drafts }o--|| cases : "case_id"
  case_invites }o--|| cases : "case_id"
  case_invites }o--|| users : "client_id"
  case_invites }o--|| users : "attorney_id"
  assistant_liability_acceptances }o--|| users : "attorney_id"
  assistant_liability_acceptances }o--|| assistant_memberships : "membership_id"
  assistant_seat_changes }o--|| users : "user_id"
  integration_credentials }o--o| users : "created_by"
  state_bar_registries |o--|| states : "state_code"
  attorney_trust |o--|| attorney_profiles : "attorney_id"
  attorney_trust_events }o--|| attorney_profiles : "attorney_id"
  bar_number_block_events }o--|| bar_number_blocks : "block_id"
  video_assets }o--|| users : "owner_user_id"
  partner_commissions }o--|| partners : "partner_id"
  outreach_leads }o--o| partners : "partner_id"
  outreach_activities }o--|| outreach_leads : "lead_id"
  promotion_daily }o--|| case_promotions : "promotion_id"
  promotion_views }o--|| case_promotions : "promotion_id"
  support_message_files }o--|| support_messages : "message_id"
  support_message_files |o--|| files : "file_id"
  sticker_packs }o--o| users : "owner_user_id"
  stickers }o--|| sticker_packs : "pack_id"
  stickers |o--|| files : "file_id"
  user_sticker_packs }o--|| users : "user_id"
  user_sticker_packs }o--|| sticker_packs : "pack_id"
  user_recent_stickers }o--|| users : "user_id"
  user_recent_stickers }o--|| stickers : "sticker_id"
  gifts |o--|| files : "file_id"
  gift_sends }o--|| gifts : "gift_id"
  client_verifications |o--|| users : "user_id"
  payroll_payouts }o--|| payroll_employees : "employee_id"
  payroll_accruals }o--|| payroll_employees : "employee_id"
  document_templates |o--|| files : "file_id"
  document_templates }o--o| practice_areas : "practice_area_id"
  client_subscriptions |o--|| users : "user_id"
  client_subscriptions }o--o| plans : "plan_id"
  country_partner_settlements }o--|| country_partners : "partner_id"
  contact_matches }o--|| users : "owner_id"
  contact_matches }o--|| users : "matched_id"
  contact_sync_settings |o--|| users : "user_id"
  contact_book_hashes }o--|| users : "owner_id"
  firm_members }o--|| firms : "firm_id"
  search_synonym_groups }o--o| practice_areas : "practice_area_id"
  search_synonym_terms }o--|| search_synonym_groups : "group_id"
  stories }o--|| users : "author_id"
  stories }o--o| files : "file_id"
  stories |o--o| video_assets : "video_asset_id"
  story_views }o--|| stories : "story_id"
  story_views }o--|| users : "viewer_id"
  story_hidden }o--|| users : "owner_id"
  story_hidden }o--|| users : "hidden_user_id"
  story_settings |o--|| users : "user_id"
  channels }o--|| users : "owner_id"
  channels }o--o| files : "avatar_file_id"
  channel_admins }o--|| channels : "channel_id"
  channel_admins }o--|| users : "user_id"
  channel_subscriptions }o--|| channels : "channel_id"
  channel_subscriptions }o--|| users : "user_id"
  channel_posts }o--|| channels : "channel_id"
  channel_posts }o--|| users : "author_id"
  channel_posts |o--o| video_assets : "video_asset_id"
  channel_post_views }o--|| channel_posts : "post_id"
  channel_post_shares }o--|| channel_posts : "post_id"
  channel_reactions }o--|| channel_posts : "post_id"
  channel_reactions }o--|| users : "user_id"
  channel_comments }o--|| channel_posts : "post_id"
  channel_comments }o--|| users : "author_id"
  case_time_entries }o--|| cases : "case_id"
  case_expenses }o--|| cases : "case_id"
  case_expenses }o--o| files : "receipt_file_id"
  case_invoices }o--|| cases : "case_id"
  case_sign_requests }o--|| cases : "case_id"
  case_signatures }o--|| case_sign_requests : "request_id"
  form_templates }o--o| practice_areas : "practice_area_id"
  consultation_settings |o--|| users : "attorney_id"
  consultation_windows }o--|| users : "attorney_id"
  consultation_time_off }o--|| users : "attorney_id"
  consultations }o--|| users : "attorney_id"
  consultations }o--|| users : "client_id"
  legal_questions }o--|| users : "author_id"
  legal_questions }o--o| practice_areas : "practice_area_id"
  legal_questions }o--o| states : "state_code"
  legal_answers }o--|| legal_questions : "question_id"
  legal_answers }o--|| users : "attorney_id"
  legal_answer_likes }o--|| legal_answers : "answer_id"
  legal_answer_likes }o--|| users : "user_id"
  legal_exports }o--|| data_access_requests : "request_id"
  legal_holds }o--|| data_access_requests : "request_id"
  csam_reports }o--|| media_moderation_checks : "check_id"
  experiment_exposures }o--|| experiments : "experiment_id"
  experiment_results }o--|| experiments : "experiment_id"
```
