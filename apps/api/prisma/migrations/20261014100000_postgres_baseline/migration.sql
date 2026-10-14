-- PostgreSQL baseline (owner 2026-10-14: the whole project moves from
-- CockroachDB to PostgreSQL). Replaces the 155 CockroachDB migrations: the
-- schema of docs/02_DATABASE.md as PostgreSQL DDL, the generated columns
-- (name / phone hash / search vectors) as `GENERATED ALWAYS ... STORED`,
-- then the reference rows the old migrations inserted (settings, flags,
-- countries, regions). Further migrations are plain PostgreSQL on top.



CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TYPE public.admin_role AS ENUM (
    'super_admin',
    'moderator',
    'verifier',
    'support',
    'finance'
);

CREATE TYPE public.assistant_approval AS ENUM (
    'purchase',
    'attorney_added',
    'attorney_otp'
);

CREATE TYPE public.assistant_request_kind AS ENUM (
    'post',
    'comment',
    'case_comment',
    'profile_edit'
);

CREATE TYPE public.assistant_request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE public.assistant_status AS ENUM (
    'invited',
    'active',
    'removed'
);

CREATE TYPE public.attorney_task_kind AS ENUM (
    'call',
    'meeting',
    'court',
    'deadline',
    'documents',
    'print',
    'visit',
    'other',
    'consultation',
    'hearing_prep',
    'deposition',
    'mediation',
    'filing',
    'review',
    'email',
    'sign',
    'payment',
    'research',
    'jail_visit'
);

CREATE TYPE public.attorney_task_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);

CREATE TYPE public.attorney_task_repeat AS ENUM (
    'none',
    'daily',
    'weekdays',
    'weekly',
    'monthly',
    'yearly'
);

CREATE TYPE public.attorney_task_status AS ENUM (
    'open',
    'taken',
    'done',
    'not_done',
    'cancelled'
);

CREATE TYPE public.bid_status AS ENUM (
    'active',
    'accepted',
    'rejected_by_client',
    'rejected_auto',
    'withdrawn',
    'failed_negotiation'
);

CREATE TYPE public.budget_mode AS ENUM (
    'amount',
    'clarify_later'
);

CREATE TYPE public.call_status AS ENUM (
    'ringing',
    'active',
    'ended',
    'missed',
    'declined',
    'busy',
    'canceled',
    'failed'
);

CREATE TYPE public.case_journal_event AS ENUM (
    'created',
    'updated',
    'bid_placed',
    'offer_made',
    'bid_accepted',
    'bid_rejected',
    'bid_withdrawn',
    'negotiation_failed',
    'contacts_disclosed',
    'completion_requested',
    'completion_confirmed',
    'auto_closed',
    'disputed',
    'dispute_resolved',
    'archived',
    'restored',
    'deleted',
    'closed'
);

CREATE TYPE public.case_status AS ENUM (
    'open',
    'in_progress',
    'pending_completion',
    'disputed',
    'closed',
    'archived'
);

CREATE TYPE public.chat_folder AS ENUM (
    'primary',
    'general'
);

CREATE TYPE public.check_result AS ENUM (
    'pass',
    'fail',
    'manual_review'
);

CREATE TYPE public.consent_type AS ENUM (
    'terms',
    'privacy',
    'disclaimer',
    'client_contact_sharing',
    'age_18',
    'marketing_email',
    'marketing_push',
    'analytics',
    'attorney_agreement',
    'client_agreement',
    'eula'
);

CREATE TYPE public.contact_issue_status AS ENUM (
    'open',
    'confirmed',
    'rejected'
);

CREATE TYPE public.contact_issue_type AS ENUM (
    'phone_invalid',
    'no_answer',
    'email_bounce',
    'wrong_person',
    'other'
);

CREATE TYPE public.contact_method AS ENUM (
    'call',
    'sms',
    'email',
    'in_app_chat'
);

CREATE TYPE public.content_status AS ENUM (
    'published',
    'hidden',
    'removed',
    'processing'
);

CREATE TYPE public.conversation_status AS ENUM (
    'pre_acceptance',
    'active',
    'closed'
);

CREATE TYPE public.data_export_status AS ENUM (
    'queued',
    'processing',
    'ready',
    'failed',
    'expired'
);

CREATE TYPE public.data_export_type AS ENUM (
    'user_data',
    'case_history_pdf'
);

CREATE TYPE public.data_request_status AS ENUM (
    'received',
    'in_progress',
    'fulfilled',
    'rejected'
);

CREATE TYPE public.data_request_type AS ENUM (
    'subpoena',
    'court_order'
);

CREATE TYPE public.dispute_status AS ENUM (
    'open',
    'resolved'
);

CREATE TYPE public.document_template_audience AS ENUM (
    'everyone',
    'lawyers'
);

CREATE TYPE public.fee_type AS ENUM (
    'fixed',
    'hourly',
    'free_consultation'
);

CREATE TYPE public.file_purpose AS ENUM (
    'avatar',
    'post_image',
    'verification_document',
    'verification_selfie',
    'post_video',
    'data_export',
    'case_photo',
    'case_attachment',
    'chat_voice',
    'chat_attachment',
    'task_attachment',
    'review_photo',
    'sticker',
    'post_attachment',
    'document_template'
);

CREATE TYPE public.identifier_type AS ENUM (
    'phone',
    'email',
    'apple',
    'google'
);

CREATE TYPE public.integration_credential_status AS ENUM (
    'pending',
    'active',
    'retired'
);

CREATE TYPE public.legal_doc_type AS ENUM (
    'terms',
    'privacy',
    'disclaimer',
    'client_contact_sharing',
    'attorney_agreement',
    'client_agreement',
    'eula',
    'refund',
    'cookies',
    'third_party_services',
    'partner_terms',
    'dmca_policy'
);

CREATE TYPE public.license_status AS ENUM (
    'pending',
    'verified',
    'rejected',
    'expired',
    'suspended'
);

CREATE TYPE public.media_type AS ENUM (
    'image',
    'video'
);

CREATE TYPE public.message_request_status AS ENUM (
    'none',
    'pending',
    'accepted',
    'declined'
);

CREATE TYPE public.message_type AS ENUM (
    'text',
    'system',
    'voice',
    'call',
    'attachment',
    'sticker'
);

CREATE TYPE public.moderation_action_type AS ENUM (
    'hide',
    'remove',
    'warn',
    'suspend',
    'restore'
);

CREATE TYPE public.notification_category AS ENUM (
    'messages',
    'bids',
    'cases',
    'social',
    'system',
    'marketing',
    'calls',
    'following',
    'new_cases'
);

CREATE TYPE public.notification_type AS ENUM (
    'bid_received',
    'offer_countered',
    'offer_accepted',
    'bid_accepted',
    'bid_rejected',
    'negotiation_failed',
    'case_stale_prompt',
    'case_archived',
    'completion_requested',
    'completion_reminder',
    'case_closed',
    'new_message',
    'new_follower',
    'post_like',
    'post_comment',
    'comment_reply',
    'comment_like',
    'verification_update',
    'subscription_trial_ending',
    'subscription_payment_failed',
    'subscription_status',
    'contact_issue_update',
    'moderation_notice',
    'security_new_device',
    'review_requested',
    'review_received',
    'case_updated',
    'data_export_ready',
    'case_history_export_ready',
    'case_comment',
    'missed_call',
    'mention',
    'followed_post',
    'new_case',
    'assistant_request',
    'assistant_task',
    'assistant_joined',
    'assistant_result',
    'admin_broadcast',
    'security_phone_changed',
    'referral_reward',
    'promotion_started',
    'promotion_ended',
    'case_invite_received',
    'case_invite_declined',
    'partner_commission',
    'partner_payout',
    'case_disputed',
    'dispute_resolved',
    'case_payment_received',
    'case_payment_sent',
    'case_payment_refunded',
    'case_payment_disputed',
    'payout_account_status',
    'payment_request_created',
    'payment_request_due',
    'payment_request_overdue',
    'payment_request_canceled',
    'payment_fee_countered',
    'payment_fee_agreed',
    'partner_approved',
    'partner_declined',
    'task_reminder',
    'task_assigned',
    'task_purge_soon',
    'case_deadline_soon',
    'case_deadline_today',
    'case_deadline_passed',
    'case_deadline_changed',
    'new_urgent_case',
    'post_repost'
);

CREATE TYPE public.offer_status AS ENUM (
    'pending',
    'accepted',
    'declined',
    'countered',
    'superseded'
);

CREATE TYPE public.party_role AS ENUM (
    'client',
    'attorney'
);

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'succeeded',
    'failed',
    'refunded'
);

CREATE TYPE public.post_kind AS ENUM (
    'post',
    'news'
);

CREATE TYPE public.report_reason AS ENUM (
    'spam',
    'abuse',
    'misinformation',
    'impersonation',
    'inappropriate',
    'other',
    'off_topic',
    'conflict_of_interest',
    'profanity',
    'harassment',
    'hate_speech',
    'personal_info',
    'fraud',
    'copyright'
);

CREATE TYPE public.report_status AS ENUM (
    'open',
    'actioned',
    'dismissed'
);

CREATE TYPE public.report_target_type AS ENUM (
    'post',
    'comment',
    'user',
    'message',
    'case',
    'review',
    'case_comment',
    'client_review',
    'sticker_pack'
);

CREATE TYPE public.review_appeal_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'auto_removed'
);

CREATE TYPE public.review_status AS ENUM (
    'published',
    'hidden',
    'removed'
);

CREATE TYPE public.saved_item_type AS ENUM (
    'post',
    'case'
);

CREATE TYPE public.scan_status AS ENUM (
    'pending',
    'clean',
    'infected',
    'failed'
);

CREATE TYPE public.start_availability AS ENUM (
    'immediately',
    'within_week',
    'custom_date'
);

CREATE TYPE public.subscription_plan AS ENUM (
    'monthly',
    'yearly'
);

CREATE TYPE public.subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'expired'
);

CREATE TYPE public.theme_pref AS ENUM (
    'system',
    'light',
    'dark',
    'navy',
    'glass'
);

CREATE TYPE public.user_role AS ENUM (
    'client',
    'attorney',
    'admin',
    'assistant'
);

CREATE TYPE public.user_status AS ENUM (
    'active',
    'suspended',
    'deletion_pending',
    'deleted'
);

CREATE TYPE public.verification_check_type AS ENUM (
    'bar_lookup',
    'id_check',
    'face_match'
);

CREATE TYPE public.verification_doc_type AS ENUM (
    'bar_license',
    'drivers_license',
    'passport',
    'state_id',
    'selfie',
    'other'
);

CREATE TYPE public.verification_provider AS ENUM (
    'manual',
    'stripe_identity',
    'persona'
);

CREATE TYPE public.verification_request_status AS ENUM (
    'draft',
    'submitted',
    'in_review',
    'needs_more_info',
    'approved',
    'rejected'
);

CREATE TYPE public.verification_status AS ENUM (
    'unverified',
    'pending',
    'verified',
    'rejected',
    'suspended'
);

CREATE TYPE public.video_asset_status AS ENUM (
    'awaiting_upload',
    'processing',
    'ready',
    'failed',
    'rejected',
    'deleted'
);

CREATE TABLE public.account_bans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind character varying(10) NOT NULL,
    value text NOT NULL,
    user_id uuid,
    reason text NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lifted_at timestamp with time zone,
    lifted_by uuid,
    lift_reason text,
    CONSTRAINT account_bans_kind_check CHECK (((kind)::text = ANY ((ARRAY['user'::character varying, 'phone'::character varying, 'email'::character varying, 'device'::character varying])::text[])))
);

CREATE TABLE public.admin_broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    title character varying(120) NOT NULL,
    body character varying(1000) NOT NULL,
    audience character varying(20) NOT NULL,
    state_code character varying(2),
    recipients bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    state_codes text[] DEFAULT ARRAY[]::text[] NOT NULL
);

CREATE TABLE public.admin_credentials (
    user_id uuid NOT NULL,
    totp_secret_enc text NOT NULL,
    totp_enabled_at timestamp with time zone,
    recovery_codes_hash text[] DEFAULT ARRAY[]::text[] NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    login character varying(40),
    password_hash text,
    password_changed_at timestamp with time zone,
    security_question character varying(200),
    security_answer_hash text
);

CREATE TABLE public.admin_profiles (
    user_id uuid NOT NULL,
    admin_role public.admin_role NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.admin_role_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(60) NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.app_config (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.assistant_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    action text NOT NULL,
    target_type text,
    target_id text,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assistant_liability_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    duties text[] NOT NULL,
    granted boolean NOT NULL,
    terms_version character varying(20) NOT NULL,
    ip character varying(64),
    user_agent character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assistant_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    assistant_user_id uuid,
    phone_e164 text,
    display_name text,
    status public.assistant_status DEFAULT 'invited'::public.assistant_status NOT NULL,
    approval public.assistant_approval NOT NULL,
    duties text[] DEFAULT ARRAY[]::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    joined_at timestamp with time zone,
    removed_at timestamp with time zone,
    join_code_hash text,
    join_code_enc text,
    join_code_expires_at timestamp with time zone,
    CONSTRAINT assistant_memberships_name_len CHECK (((display_name IS NULL) OR (char_length(display_name) <= 80)))
);

CREATE TABLE public.assistant_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    kind public.assistant_request_kind NOT NULL,
    payload jsonb NOT NULL,
    status public.assistant_request_status DEFAULT 'pending'::public.assistant_request_status NOT NULL,
    result_id text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone
);

CREATE TABLE public.attorney_licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    state_code character(2) NOT NULL,
    bar_number text NOT NULL,
    license_status public.license_status DEFAULT 'pending'::public.license_status NOT NULL,
    expires_at date,
    verified_at timestamp with time zone,
    verified_by uuid,
    auto_check_result jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    rejection_code text,
    rejection_note text,
    registry_flag text,
    registry_flagged_at timestamp with time zone
);

CREATE TABLE public.attorney_practice_areas (
    attorney_id uuid NOT NULL,
    practice_area_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.attorney_profiles (
    user_id uuid NOT NULL,
    username text NOT NULL,
    username_lower text NOT NULL,
    bio text,
    firm_name text,
    languages text[],
    verification_status public.verification_status DEFAULT 'unverified'::public.verification_status NOT NULL,
    verified_at timestamp with time zone,
    rating_avg numeric(3,2) DEFAULT 0 NOT NULL,
    rating_count integer DEFAULT 0 NOT NULL,
    posts_count integer DEFAULT 0 NOT NULL,
    followers_count integer DEFAULT 0 NOT NULL,
    following_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    username_changed_at timestamp with time zone,
    firm_names text[] DEFAULT ARRAY[]::text[] NOT NULL,
    verified_first_name text,
    verified_last_name text,
    name_mismatch boolean DEFAULT false NOT NULL,
    new_case_alerts_custom boolean DEFAULT false NOT NULL,
    assistant_seat_limit smallint,
    trust_level smallint DEFAULT 0 NOT NULL,
    trust_badge boolean DEFAULT false NOT NULL,
    new_case_alerts_urgent_only boolean DEFAULT false NOT NULL,
    CONSTRAINT attorney_profiles_bio_len CHECK ((char_length(bio) <= 300)),
    CONSTRAINT attorney_profiles_username_lower_ck CHECK ((username_lower = lower(username)))
);

CREATE TABLE public.attorney_task_people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    user_id uuid,
    role character varying(60),
    name character varying(120) NOT NULL,
    phone character varying(20),
    email character varying(254),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.attorney_task_places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    label character varying(80),
    address character varying(300) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.attorney_task_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    kind public.attorney_task_kind,
    title character varying(160) NOT NULL,
    due_at timestamp with time zone,
    location character varying(200),
    contact_name character varying(120),
    contact_phone character varying(20),
    contact_email character varying(254),
    status public.attorney_task_status DEFAULT 'open'::public.attorney_task_status NOT NULL,
    note character varying(1000),
    done_at timestamp with time zone,
    created_by_name character varying(120),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.attorney_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    created_by_membership_id uuid,
    kind public.attorney_task_kind NOT NULL,
    title text NOT NULL,
    notes text,
    due_at timestamp with time zone,
    case_id uuid,
    file_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    status public.attorney_task_status DEFAULT 'open'::public.attorney_task_status NOT NULL,
    outcome_note text,
    rescheduled_to timestamp with time zone,
    done_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assignee_membership_id uuid,
    conversation_id uuid,
    priority public.attorney_task_priority DEFAULT 'normal'::public.attorney_task_priority NOT NULL,
    repeat public.attorney_task_repeat DEFAULT 'none'::public.attorney_task_repeat NOT NULL,
    repeat_until timestamp with time zone,
    repeated_at timestamp with time zone,
    remind_before_min integer,
    remind_at timestamp with time zone,
    reminded_at timestamp with time zone,
    archived_at timestamp with time zone,
    keep_forever boolean DEFAULT false NOT NULL,
    purge_notice_days integer,
    case_task_id uuid,
    CONSTRAINT attorney_tasks_notes_len CHECK (((notes IS NULL) OR (char_length(notes) <= 2000))),
    CONSTRAINT attorney_tasks_title_len CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)))
);

CREATE TABLE public.attorney_trust (
    attorney_id uuid NOT NULL,
    level smallint DEFAULT 0 NOT NULL,
    license_confirmed_at timestamp with time zone,
    license_confirmed_by character varying(16),
    license_confirmed_note character varying(500),
    documents_verified_at timestamp with time zone,
    documents_verified_by uuid,
    stripe_kyc_at timestamp with time zone,
    stripe_charges_enabled boolean DEFAULT false NOT NULL,
    stripe_legal_name character varying(200),
    stripe_business_type character varying(24),
    stripe_company_name character varying(200),
    stripe_company_domain character varying(200),
    stripe_representative character varying(200),
    name_check character varying(16) DEFAULT 'unknown'::character varying NOT NULL,
    name_checked_at timestamp with time zone,
    firm_link_status character varying(16) DEFAULT 'none'::character varying NOT NULL,
    firm_link_source character varying(16),
    firm_link_at timestamp with time zone,
    firm_link_note character varying(500),
    firm_email_domain character varying(200),
    firm_email_verified_at timestamp with time zone,
    payments_hold character varying(32),
    payments_hold_at timestamp with time zone,
    bids_hold character varying(32),
    bids_hold_at timestamp with time zone,
    hold_note character varying(500),
    complaints_total integer DEFAULT 0 NOT NULL,
    duplicate_claims integer DEFAULT 0 NOT NULL,
    payout_delay_days smallint,
    payout_delay_synced_at timestamp with time zone,
    computed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    staff_cleared_at timestamp with time zone,
    staff_cleared_by uuid,
    staff_cleared_note character varying(500),
    documents_requested_at timestamp with time zone,
    documents_requested_template character varying(32)
);

CREATE TABLE public.attorney_trust_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    kind character varying(48) NOT NULL,
    from_level smallint,
    to_level smallint,
    actor_type character varying(16) DEFAULT 'system'::character varying NOT NULL,
    actor_id uuid,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    before jsonb,
    after jsonb,
    ip text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_shard smallint DEFAULT 0 NOT NULL,
    justification text
);

CREATE TABLE public.auth_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    success boolean NOT NULL,
    identifier_hash text,
    ip text,
    device_id text,
    user_agent text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_shard smallint DEFAULT 0 NOT NULL
);

CREATE TABLE public.bar_number_block_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    block_id uuid NOT NULL,
    kind character varying(32) NOT NULL,
    actor_type character varying(16) DEFAULT 'system'::character varying NOT NULL,
    actor_id uuid,
    reason character varying(500),
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bar_number_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state_code character(2) NOT NULL,
    bar_number text NOT NULL,
    bar_key text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    reason character varying(500) NOT NULL,
    source character varying(32) NOT NULL,
    attorney_id uuid,
    blocked_by uuid,
    blocked_at timestamp with time zone DEFAULT now() NOT NULL,
    block_contacts boolean DEFAULT false NOT NULL,
    email_lower text,
    phone_e164 text,
    unblocked_at timestamp with time zone,
    unblocked_by uuid,
    unblock_reason character varying(500),
    attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.bid_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    case_id uuid NOT NULL,
    payload jsonb NOT NULL,
    prepared_by_name character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bid_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bid_id uuid NOT NULL,
    round_no smallint NOT NULL,
    from_role public.party_role NOT NULL,
    fee_type public.fee_type NOT NULL,
    amount_cents integer NOT NULL,
    message text,
    status public.offer_status NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT bid_offers_amount_cents_ck CHECK ((amount_cents >= 0)),
    CONSTRAINT bid_offers_round_no_ck CHECK (((round_no >= 0) AND (round_no <= 5)))
);

CREATE TABLE public.bids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    attorney_id uuid NOT NULL,
    status public.bid_status DEFAULT 'active'::public.bid_status NOT NULL,
    fee_type public.fee_type NOT NULL,
    amount_cents integer NOT NULL,
    message text NOT NULL,
    start_availability public.start_availability NOT NULL,
    start_date date,
    estimated_duration_days integer,
    round_count smallint DEFAULT 0 NOT NULL,
    turn public.party_role NOT NULL,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    outside_practice boolean DEFAULT false NOT NULL,
    outside_licensed_states boolean DEFAULT false NOT NULL,
    CONSTRAINT bids_amount_cents_ck CHECK ((amount_cents >= 0)),
    CONSTRAINT bids_message_len CHECK ((char_length(message) <= 2000)),
    CONSTRAINT bids_round_count_ck CHECK (((round_count >= 0) AND (round_count <= 5)))
);

CREATE TABLE public.blocked_email_domains (
    domain text NOT NULL,
    reason text NOT NULL
);

CREATE TABLE public.calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    caller_id uuid NOT NULL,
    callee_id uuid NOT NULL,
    status public.call_status DEFAULT 'ringing'::public.call_status NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_sec integer,
    end_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    video boolean DEFAULT false NOT NULL
);

CREATE TABLE public.case_comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.case_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    author_id uuid NOT NULL,
    parent_comment_id uuid,
    body text NOT NULL,
    status public.content_status DEFAULT 'published'::public.content_status NOT NULL,
    like_count integer DEFAULT 0 NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT case_comments_body_len CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000)))
);

CREATE TABLE public.case_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    opened_by uuid NOT NULL,
    reason text NOT NULL,
    status public.dispute_status DEFAULT 'open'::public.dispute_status NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.case_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    client_id uuid NOT NULL,
    attorney_id uuid NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    message character varying(1000),
    budget_cents integer,
    decline_reason character varying(500),
    outside_practice boolean DEFAULT false NOT NULL,
    outside_licensed_states boolean DEFAULT false NOT NULL,
    bid_id uuid,
    expires_at timestamp with time zone NOT NULL,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.case_journal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    client_id uuid NOT NULL,
    actor_user_id uuid,
    actor_role public.user_role,
    event_type public.case_journal_event NOT NULL,
    payload jsonb NOT NULL,
    prev_hash text,
    row_hash text NOT NULL,
    retain_until timestamp with time zone DEFAULT (now() + '5 years'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    attorney_id uuid
);

CREATE TABLE public.case_payment_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    reason character varying(500) NOT NULL,
    initiated_by_type character varying(16) NOT NULL,
    initiated_by uuid,
    stripe_refund_id text,
    status character varying(16) NOT NULL,
    failure_reason text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT case_payment_refunds_amount_check CHECK ((amount_cents > 0))
);

CREATE TABLE public.case_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    bid_id uuid,
    client_id uuid NOT NULL,
    attorney_id uuid NOT NULL,
    kind character varying(16) NOT NULL,
    status character varying(24) NOT NULL,
    amount_cents integer NOT NULL,
    platform_fee_cents integer DEFAULT 0 NOT NULL,
    processing_fee_cents integer DEFAULT 0 NOT NULL,
    client_total_cents integer NOT NULL,
    attorney_net_cents integer NOT NULL,
    fee_type character varying(16) NOT NULL,
    fee_payer character varying(16) NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    note character varying(200),
    stripe_account_id text,
    stripe_checkout_id text,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    receipt_url text,
    refunded_cents integer DEFAULT 0 NOT NULL,
    dispute_status character varying(32),
    disputed_at timestamp with time zone,
    paid_at timestamp with time zone,
    canceled_reason character varying(100),
    failure_code character varying(100),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    request_id uuid,
    processing_fee_payer character varying(16) DEFAULT 'client'::character varying NOT NULL,
    CONSTRAINT case_payments_amount_check CHECK (((amount_cents > 0) AND (platform_fee_cents >= 0) AND (processing_fee_cents >= 0) AND (client_total_cents > 0) AND (attorney_net_cents >= 0) AND (refunded_cents >= 0))),
    CONSTRAINT case_payments_kind_check CHECK (((kind)::text = ANY ((ARRAY['bid'::character varying, 'deposit'::character varying, 'balance'::character varying, 'custom'::character varying, 'invoice'::character varying])::text[]))),
    CONSTRAINT case_payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending_payment'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'canceled'::character varying, 'refunded'::character varying, 'partially_refunded'::character varying, 'disputed'::character varying])::text[])))
);

CREATE TABLE public.case_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    file_id uuid NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description character varying(500),
    source text DEFAULT 'case'::text NOT NULL,
    source_id uuid,
    added_by uuid,
    source_item_id uuid,
    is_sample boolean DEFAULT false NOT NULL,
    CONSTRAINT case_photos_source_valid CHECK ((source = ANY (ARRAY['case'::text, 'task'::text, 'update'::text])))
);

CREATE TABLE public.case_promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    user_id uuid NOT NULL,
    days smallint NOT NULL,
    price_cents_per_day integer NOT NULL,
    total_cents integer NOT NULL,
    status character varying(20) NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    stripe_checkout_id text,
    payment_id uuid,
    promo_code_id uuid,
    granted_by uuid,
    canceled_by uuid,
    cancel_reason character varying(500),
    impressions integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    audience jsonb,
    clicks integer DEFAULT 0 NOT NULL,
    cpm_cents integer,
    post_id uuid,
    reach integer DEFAULT 0 NOT NULL,
    refunded_cents integer DEFAULT 0 NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    target_impressions integer,
    target_type character varying(8) DEFAULT 'case'::character varying NOT NULL,
    CONSTRAINT case_promotions_days_check CHECK (((days >= 1) AND (days <= 90))),
    CONSTRAINT case_promotions_status_check CHECK (((status)::text = ANY ((ARRAY['pending_payment'::character varying, 'active'::character varying, 'finished'::character varying, 'canceled'::character varying, 'refunded'::character varying])::text[])))
);

CREATE TABLE public.case_reads (
    case_id uuid NOT NULL,
    user_id uuid NOT NULL,
    updates_seen_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.case_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.case_states (
    case_id uuid NOT NULL,
    state_code character(2) NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);

CREATE TABLE public.case_task_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    case_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    type text NOT NULL,
    note character varying(1000),
    file_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT case_task_events_type_valid CHECK ((type = ANY (ARRAY['created'::text, 'files_added'::text, 'done'::text, 'undone'::text, 'closed'::text, 'reopened'::text])))
);

CREATE TABLE public.case_task_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    "position" smallint NOT NULL,
    title character varying(200) NOT NULL,
    done_at timestamp with time zone,
    done_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.case_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    kind text NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    created_by uuid NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    done_at timestamp with time zone,
    done_by uuid,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    due_at timestamp with time zone,
    CONSTRAINT case_tasks_description_len CHECK (((description IS NULL) OR (char_length(description) <= 5000))),
    CONSTRAINT case_tasks_kind_valid CHECK ((kind = ANY (ARRAY['shared'::text, 'for_client'::text]))),
    CONSTRAINT case_tasks_status_valid CHECK ((status = ANY (ARRAY['open'::text, 'done'::text])))
);

CREATE TABLE public.case_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body character varying(5000) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    practice_area_id uuid NOT NULL,
    primary_state_code character(2) NOT NULL,
    city text,
    budget_mode public.budget_mode NOT NULL,
    budget_cents integer,
    status public.case_status DEFAULT 'open'::public.case_status NOT NULL,
    accepted_bid_id uuid,
    view_count integer DEFAULT 0 NOT NULL,
    bids_count integer DEFAULT 0 NOT NULL,
    last_activity_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    stale_prompt_sent_at timestamp with time zone,
    archived_at timestamp with time zone,
    client_completed_at timestamp with time zone,
    attorney_confirmed_at timestamp with time zone,
    auto_close_at timestamp with time zone,
    closed_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((title || ' '::text) || description))) STORED,
    comment_count integer DEFAULT 0 NOT NULL,
    share_count integer DEFAULT 0 NOT NULL,
    cover_key text,
    urgency text,
    deadline_at date,
    deadline_kind text,
    search_tsv_simple tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, ((title || ' '::text) || description))) STORED,
    CONSTRAINT cases_budget_cents_ck CHECK ((budget_cents >= 0)),
    CONSTRAINT cases_budget_mode_ck CHECK (((budget_mode = 'amount'::public.budget_mode) = (budget_cents IS NOT NULL))),
    CONSTRAINT cases_cover_key_check CHECK (((cover_key IS NULL) OR (cover_key ~ '^(art:[0-3]|icon:[a-z_]{2,32})$'::text))),
    CONSTRAINT cases_deadline_check CHECK (
CASE
    WHEN (urgency = 'by_date'::text) THEN (deadline_at IS NOT NULL)
    ELSE (deadline_at IS NULL)
END),
    CONSTRAINT cases_deadline_kind_check CHECK (((deadline_kind IS NULL) OR ((deadline_at IS NOT NULL) AND (deadline_kind = ANY (ARRAY['court_hearing'::text, 'filing_deadline'::text, 'meeting'::text, 'signing'::text, 'other'::text]))))),
    CONSTRAINT cases_description_len CHECK ((char_length(description) <= 5000)),
    CONSTRAINT cases_title_len CHECK ((char_length(title) <= 120)),
    CONSTRAINT cases_urgency_check CHECK (((urgency IS NULL) OR (urgency = ANY (ARRAY['flexible'::text, 'within_month'::text, 'soon'::text, 'urgent'::text, 'very_urgent'::text, 'by_date'::text]))))
);

CREATE TABLE public.client_fraud_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    kind character varying(32) NOT NULL,
    actor_type character varying(16) DEFAULT 'system'::character varying NOT NULL,
    actor_id uuid,
    note character varying(500),
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_fraud_profiles (
    user_id uuid NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    status character varying(16) DEFAULT 'ok'::character varying NOT NULL,
    signals jsonb DEFAULT '[]'::jsonb NOT NULL,
    linked_user_id uuid,
    queue_reason character varying(16),
    queued_at timestamp with time zone,
    cleared_score integer,
    cleared_by uuid,
    cleared_at timestamp with time zone,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.client_profiles (
    user_id uuid NOT NULL,
    state_code character(2) NOT NULL,
    preferred_languages text[],
    preferred_contact_method public.contact_method,
    preferred_contact_note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    username text,
    username_lower text,
    username_changed_at timestamp with time zone,
    posts_count integer DEFAULT 0 NOT NULL,
    followers_count integer DEFAULT 0 NOT NULL,
    following_count integer DEFAULT 0 NOT NULL,
    rating_avg numeric(3,2) DEFAULT 0 NOT NULL,
    rating_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT client_profiles_contact_note_len CHECK ((char_length(preferred_contact_note) <= 200))
);

CREATE TABLE public.client_review_appeals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    appellant_id uuid NOT NULL,
    reason text NOT NULL,
    status public.review_appeal_status DEFAULT 'pending'::public.review_appeal_status NOT NULL,
    auto_remove_at timestamp with time zone NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_review_appeals_reason_len CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 1000)))
);

CREATE TABLE public.client_review_helpful_votes (
    review_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    attorney_id uuid NOT NULL,
    client_id uuid NOT NULL,
    rating smallint NOT NULL,
    body text,
    status public.review_status DEFAULT 'published'::public.review_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    reply character varying(1000),
    reply_at timestamp with time zone,
    helpful_count integer DEFAULT 0 NOT NULL,
    edited_at timestamp with time zone,
    photo_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT client_reviews_body_len CHECK (((body IS NULL) OR (char_length(body) <= 2000))),
    CONSTRAINT client_reviews_rating CHECK (((rating >= 1) AND (rating <= 5)))
);

CREATE TABLE public.client_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_id uuid,
    stripe_checkout_id character varying(255),
    stripe_subscription_id character varying(255),
    status character varying(16) DEFAULT 'incomplete'::character varying NOT NULL,
    price_cents integer DEFAULT 0 NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    canceled_at timestamp with time zone,
    entitlements jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    document_file_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    note character varying(500),
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    reject_reason character varying(500),
    revoke_reason character varying(500),
    stripe_checkout_id character varying(255),
    stripe_subscription_id character varying(255),
    sub_status character varying(16) DEFAULT 'none'::character varying NOT NULL,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    parent_comment_id uuid,
    body text NOT NULL,
    status public.content_status DEFAULT 'published'::public.content_status NOT NULL,
    like_count integer DEFAULT 0 NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT comments_body_len CHECK ((char_length(body) <= 1000))
);

CREATE TABLE public.connected_customers (
    client_id uuid NOT NULL,
    stripe_account_id text NOT NULL,
    stripe_customer_id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.contact_disclosures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    bid_id uuid NOT NULL,
    client_id uuid NOT NULL,
    attorney_id uuid NOT NULL,
    fields text[],
    ip text,
    device_id text,
    disclosed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.contact_issue_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    bid_id uuid NOT NULL,
    attorney_id uuid NOT NULL,
    client_id uuid NOT NULL,
    issue_type public.contact_issue_type NOT NULL,
    note text,
    status public.contact_issue_status DEFAULT 'open'::public.contact_issue_status NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.contact_matches (
    owner_id uuid NOT NULL,
    matched_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_matches_not_self CHECK ((owner_id <> matched_id))
);

CREATE TABLE public.contact_sync_settings (
    user_id uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    synced_at timestamp with time zone
);

CREATE TABLE public.contract_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    months smallint NOT NULL,
    assistant_seats smallint DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    contract_ref character varying(200),
    note character varying(1000),
    created_by uuid NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    revoke_reason character varying(500),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT contract_grants_months_check CHECK (((months >= 1) AND (months <= 24))),
    CONSTRAINT contract_grants_seats_check CHECK (((assistant_seats >= 0) AND (assistant_seats <= 50)))
);

CREATE TABLE public.conversation_participants (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_message_id uuid,
    muted_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    folder public.chat_folder,
    waiting_since timestamp with time zone,
    note character varying(280),
    pinned_at timestamp with time zone,
    hidden_at timestamp with time zone
);

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    attorney_id uuid NOT NULL,
    client_id uuid NOT NULL,
    bid_id uuid,
    status public.conversation_status DEFAULT 'pre_acceptance'::public.conversation_status NOT NULL,
    contacts_unlocked boolean DEFAULT false NOT NULL,
    last_message_at timestamp with time zone,
    last_message_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    request_status public.message_request_status DEFAULT 'none'::public.message_request_status NOT NULL,
    requested_by uuid
);

CREATE TABLE public.countries (
    code character(2) NOT NULL,
    name text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    calling_code text NOT NULL,
    currency character(3) NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    region_kind text DEFAULT 'region'::text NOT NULL,
    timezone text,
    stripe_supported boolean DEFAULT false NOT NULL,
    sort integer NOT NULL,
    enabled_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.country_partner_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    period character varying(7) NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    gross_cents integer NOT NULL,
    refunds_cents integer DEFAULT 0 NOT NULL,
    fees_cents integer DEFAULT 0 NOT NULL,
    net_cents integer NOT NULL,
    share_bps integer NOT NULL,
    amount_cents integer NOT NULL,
    status character varying(16) DEFAULT 'held'::character varying NOT NULL,
    accrual_ref character varying(120),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.country_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    name character varying(120) NOT NULL,
    contact character varying(200),
    lead_admin_id uuid NOT NULL,
    share_bps integer NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    max_admins integer DEFAULT 10 NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    payroll_employee_id uuid,
    contract_starts_at timestamp with time zone,
    contract_ends_at timestamp with time zone,
    contract_version integer,
    contract_accepted_at timestamp with time zone,
    contract_accepted_ip character varying(64),
    goals jsonb DEFAULT '[]'::jsonb NOT NULL,
    suspended_admin_ids text[] DEFAULT ARRAY[]::text[] NOT NULL,
    note character varying(1000),
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    disabled_at timestamp with time zone,
    contract_expired_at timestamp with time zone
);

CREATE TABLE public.country_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character(2) NOT NULL,
    email text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notified_at timestamp with time zone
);

CREATE TABLE public.data_access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    accessed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.data_access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_type public.data_request_type NOT NULL,
    reference_number text NOT NULL,
    agency text NOT NULL,
    received_at timestamp with time zone NOT NULL,
    scope text NOT NULL,
    handled_by uuid NOT NULL,
    status public.data_request_status NOT NULL,
    closed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.data_export_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.data_export_type NOT NULL,
    status public.data_export_status DEFAULT 'queued'::public.data_export_status NOT NULL,
    file_id uuid,
    expires_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.demo_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    demo_user_id uuid NOT NULL,
    role character varying(16) NOT NULL,
    display_name character varying(120) NOT NULL,
    label character varying(200),
    created_by_user_id uuid,
    created_by_admin_id uuid,
    invite_code_hash character varying(64),
    invite_expires_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.dmca_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid,
    target_type public.report_target_type,
    target_id uuid,
    infringing_url character varying(1000),
    complainant_name character varying(200) NOT NULL,
    complainant_email character varying(254) NOT NULL,
    complainant_address character varying(500) NOT NULL,
    complainant_phone character varying(40),
    work_description character varying(4000) NOT NULL,
    good_faith boolean NOT NULL,
    accuracy_sworn boolean NOT NULL,
    signature character varying(200) NOT NULL,
    status character varying(24) DEFAULT 'new'::character varying NOT NULL,
    submitted_by_user_id uuid,
    author_user_id uuid,
    counter jsonb,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note character varying(1000),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    file_name text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    practice_area_id uuid,
    state character(2),
    language text DEFAULT 'en'::text NOT NULL,
    audience public.document_template_audience DEFAULT 'everyone'::public.document_template_audience NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    download_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    deleted_at timestamp(6) with time zone
);

CREATE TABLE public.email_templates (
    key character varying(64) NOT NULL,
    locale character varying(5) NOT NULL,
    subject character varying(200) NOT NULL,
    text_body text NOT NULL,
    html_body text,
    enabled boolean DEFAULT true NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.feature_flags (
    key text NOT NULL,
    enabled boolean NOT NULL,
    rollout_percent integer DEFAULT 100 NOT NULL,
    description text,
    updated_by uuid,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    purpose public.file_purpose NOT NULL,
    s3_bucket text NOT NULL,
    s3_key text NOT NULL,
    mime text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    width integer,
    height integer,
    scan_status public.scan_status DEFAULT 'pending'::public.scan_status NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    source_sha256 text,
    deleted_reason character varying(16),
    purged_at timestamp with time zone
);

CREATE TABLE public.follows (
    follower_id uuid NOT NULL,
    followee_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT follows_not_self_ck CHECK ((follower_id <> followee_id))
);

CREATE TABLE public.i18n_bundle_versions (
    lang text NOT NULL,
    version integer NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.i18n_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.i18n_languages (
    code text NOT NULL,
    name_native text NOT NULL,
    is_active boolean NOT NULL,
    is_rtl boolean DEFAULT false NOT NULL,
    sort integer NOT NULL
);

CREATE TABLE public.i18n_translations (
    key_id uuid NOT NULL,
    lang text NOT NULL,
    value text NOT NULL,
    version integer NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.identity_fingerprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind character varying(16) NOT NULL,
    hash character varying(64) NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    banned_at timestamp with time zone
);

CREATE TABLE public.integration_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    version integer NOT NULL,
    status public.integration_credential_status DEFAULT 'pending'::public.integration_credential_status NOT NULL,
    secret_enc text NOT NULL,
    kid text NOT NULL,
    public_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    masked jsonb DEFAULT '{}'::jsonb NOT NULL,
    fingerprint text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    retired_at timestamp with time zone,
    last_test_at timestamp with time zone,
    last_test_ok boolean,
    last_test_error text,
    slot text DEFAULT 'main'::text NOT NULL,
    label text,
    priority integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE public.integration_custom_providers (
    id text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.legal_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_type public.legal_doc_type NOT NULL,
    version text NOT NULL,
    locale text NOT NULL,
    content_url text,
    content_md text,
    published_at timestamp with time zone,
    is_current boolean NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    status character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    requires_reacceptance boolean DEFAULT true NOT NULL,
    created_by uuid,
    changed_by uuid,
    change_note character varying(1000),
    rollback_of_id uuid
);

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid,
    type public.message_type NOT NULL,
    body_original text NOT NULL,
    body_display text NOT NULL,
    contact_masked boolean DEFAULT false NOT NULL,
    client_message_id text NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    file_id uuid,
    duration_ms integer,
    waveform integer[] DEFAULT ARRAY[]::integer[] NOT NULL,
    listened_at timestamp with time zone,
    file_name text,
    sent_by_membership_id uuid,
    sent_by_name character varying(80),
    sticker_id uuid,
    CONSTRAINT messages_file_name_len CHECK (((file_name IS NULL) OR ((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))))
);

CREATE TABLE public.moderation_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid,
    admin_id uuid NOT NULL,
    target_type public.report_target_type NOT NULL,
    target_id uuid NOT NULL,
    action public.moderation_action_type NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.new_case_alert_practices (
    attorney_id uuid NOT NULL,
    practice_area_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notification_quiet_hours (
    user_id uuid NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    timezone text NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.notification_settings (
    user_id uuid NOT NULL,
    category public.notification_category NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    category public.notification_category NOT NULL,
    payload jsonb NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dedupe_key text,
    aggregate_count integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.onboarding_state (
    user_id uuid NOT NULL,
    current_step text,
    completed_at timestamp with time zone,
    data jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.outreach_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    partner_id uuid,
    actor_admin_id uuid,
    kind character varying(12) NOT NULL,
    outcome character varying(24),
    body character varying(4000),
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.outreach_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind character varying(10) DEFAULT 'attorney'::character varying NOT NULL,
    first_name character varying(80),
    last_name character varying(80),
    company character varying(160),
    state_code character varying(2),
    city character varying(80),
    practice character varying(80),
    phone character varying(20),
    email character varying(254),
    source character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    source_ref character varying(64),
    status character varying(16) DEFAULT 'new'::character varying NOT NULL,
    partner_id uuid,
    converted_user_id uuid,
    unsubscribe_token character varying(48) NOT NULL,
    unsubscribed_at timestamp with time zone,
    last_activity_at timestamp with time zone,
    next_action_at timestamp with time zone,
    note character varying(2000),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    do_not_contact_at timestamp with time zone,
    do_not_contact_reason character varying(24),
    source_note character varying(300),
    emails_sent integer DEFAULT 0 NOT NULL,
    last_email_at timestamp with time zone
);

CREATE TABLE public.outreach_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind character varying(8) NOT NULL,
    value character varying(254) NOT NULL,
    note character varying(200),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.outreach_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(80) NOT NULL,
    kind character varying(10) DEFAULT 'any'::character varying NOT NULL,
    subject character varying(200) NOT NULL,
    body character varying(8000) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.partner_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    partner_user_id uuid NOT NULL,
    referral_id uuid,
    referred_user_id uuid,
    kind character varying(32) NOT NULL,
    amount_cents integer NOT NULL,
    status character varying(16) DEFAULT 'held'::character varying NOT NULL,
    event_ref character varying(120) NOT NULL,
    period character varying(7) NOT NULL,
    hold_until timestamp with time zone,
    approved_at timestamp with time zone,
    approved_by uuid,
    paid_at timestamp with time zone,
    paid_by uuid,
    payout_ref character varying(120),
    reversed_at timestamp with time zone,
    reversed_reason character varying(300),
    note character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    label character varying(120),
    note character varying(1000),
    attorney_rate_cents integer,
    client_rate_cents integer,
    monthly_base_cents integer DEFAULT 0 NOT NULL,
    client_rule character varying(24),
    hold_days smallint,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    external_name character varying(120),
    external_contact character varying(200),
    demo_access boolean DEFAULT false NOT NULL,
    terms_accepted_at timestamp with time zone,
    terms_version character varying(16),
    terms_ip character varying(45),
    w9_received_at timestamp with time zone
);

CREATE TABLE public.payment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    attorney_id uuid NOT NULL,
    client_id uuid NOT NULL,
    created_by uuid NOT NULL,
    amount_cents integer NOT NULL,
    description character varying(200) NOT NULL,
    due_at timestamp with time zone,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    plan_id uuid,
    seq integer DEFAULT 1 NOT NULL,
    total integer DEFAULT 1 NOT NULL,
    payment_id uuid,
    paid_at timestamp with time zone,
    canceled_at timestamp with time zone,
    last_reminded_at timestamp with time zone,
    reminders_sent integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    processing_fee_payer character varying(16) DEFAULT 'client'::character varying NOT NULL,
    fee_payer_status character varying(16) DEFAULT 'proposed'::character varying NOT NULL,
    fee_payer_by character varying(16) DEFAULT 'attorney'::character varying NOT NULL,
    fee_payer_rounds integer DEFAULT 0 NOT NULL,
    fee_payer_agreed_at timestamp with time zone
);

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_invoice_id text,
    stripe_payment_intent_id text,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status public.payment_status NOT NULL,
    paid_at timestamp with time zone,
    failure_code text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT payments_amount_cents_ck CHECK ((amount_cents >= 0))
);

CREATE TABLE public.payout_accounts (
    user_id uuid NOT NULL,
    provider character varying(16) DEFAULT 'stripe'::character varying NOT NULL,
    stripe_account_id text NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    charges_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    details_submitted boolean DEFAULT false NOT NULL,
    requirements_due text[] DEFAULT ARRAY[]::text[] NOT NULL,
    disabled_reason character varying(200),
    country character varying(2),
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    processing_fee_payer character varying(16),
    CONSTRAINT payout_accounts_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'onboarding'::character varying, 'active'::character varying, 'restricted'::character varying, 'disabled'::character varying])::text[])))
);

CREATE TABLE public.payroll_accruals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    source character varying(24) NOT NULL,
    kind character varying(24) DEFAULT 'commission'::character varying NOT NULL,
    event_ref character varying(120) NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    period character varying(40) NOT NULL,
    note character varying(300),
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    payout_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    canceled_at timestamp with time zone
);

CREATE TABLE public.payroll_employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid,
    user_id uuid,
    name character varying(120) NOT NULL,
    role_title character varying(120) DEFAULT ''::character varying NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    method_note character varying(300) DEFAULT ''::character varying NOT NULL,
    email character varying(254),
    stripe_account_id character varying(64),
    stripe_payouts_enabled boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payroll_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    period character varying(40) NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    method character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    status character varying(16) DEFAULT 'paid'::character varying NOT NULL,
    base_cents integer DEFAULT 0 NOT NULL,
    commission_cents integer DEFAULT 0 NOT NULL,
    fee_cents integer DEFAULT 0 NOT NULL,
    net_cents integer DEFAULT 0 NOT NULL,
    transfer_id character varying(64),
    failure character varying(300),
    note character varying(300),
    cancel_reason character varying(500),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    canceled_at timestamp with time zone
);

CREATE TABLE public.plan_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind character varying(64) NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    stripe_price_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    stripe_product_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    note character varying(300),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    compare_at_cents integer,
    show_discount boolean DEFAULT false NOT NULL
);

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(64) NOT NULL,
    audience character varying(16) NOT NULL,
    kind character varying(16) DEFAULT 'paid'::character varying NOT NULL,
    name jsonb DEFAULT '{}'::jsonb NOT NULL,
    tagline jsonb DEFAULT '{}'::jsonb NOT NULL,
    description jsonb DEFAULT '{}'::jsonb NOT NULL,
    "interval" character varying(8),
    price_kind character varying(64),
    entitlements jsonb DEFAULT '{}'::jsonb NOT NULL,
    highlights jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.post_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    file_id uuid NOT NULL,
    file_name text NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.post_likes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.post_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    file_id uuid NOT NULL,
    media_type public.media_type DEFAULT 'image'::public.media_type NOT NULL,
    "position" smallint NOT NULL,
    width integer,
    height integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.post_reposts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.post_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.post_tags (
    post_id uuid NOT NULL,
    tag_id uuid NOT NULL
);

CREATE TABLE public.post_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    language text,
    status public.content_status DEFAULT 'published'::public.content_status NOT NULL,
    like_count integer DEFAULT 0 NOT NULL,
    comment_count integer DEFAULT 0 NOT NULL,
    save_count integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, body)) STORED,
    created_shard smallint DEFAULT 0 NOT NULL,
    edited_at timestamp with time zone,
    share_count integer DEFAULT 0 NOT NULL,
    title text,
    practice_area_id uuid,
    kind public.post_kind DEFAULT 'post'::public.post_kind NOT NULL,
    video_asset_id uuid,
    location_name text,
    location_lat double precision,
    location_lng double precision,
    comments_enabled boolean DEFAULT true NOT NULL,
    content_class character varying(16) DEFAULT 'general'::character varying NOT NULL,
    content_class_locked boolean DEFAULT false NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    pin_slot smallint,
    pin_group text,
    search_tsv_simple tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, body)) STORED,
    CONSTRAINT posts_body_len CHECK ((char_length(body) <= 5000)),
    CONSTRAINT posts_pin_group_valid CHECK ((((pin_slot IS NULL) AND (pin_group IS NULL)) OR ((pin_slot IS NOT NULL) AND (pin_group = ANY (ARRAY['grid'::text, 'brief'::text]))))),
    CONSTRAINT posts_pin_slot_range CHECK (((pin_slot IS NULL) OR ((pin_slot >= 1) AND (pin_slot <= 3)))),
    CONSTRAINT posts_title_len CHECK (((title IS NULL) OR ((char_length(title) >= 1) AND (char_length(title) <= 120))))
);

CREATE TABLE public.practice_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    code text NOT NULL,
    name_en text NOT NULL,
    i18n_key text NOT NULL,
    sort integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(40) NOT NULL,
    description character varying(300),
    discount_type character varying(16) NOT NULL,
    percent_off smallint,
    amount_off_cents integer,
    free_days integer,
    audience character varying(16) DEFAULT 'attorney'::character varying NOT NULL,
    applies_to character varying(16) DEFAULT 'any'::character varying NOT NULL,
    max_redemptions integer,
    redeemed_count integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    stripe_coupon_id text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT promo_codes_percent_check CHECK (((percent_off IS NULL) OR ((percent_off >= 1) AND (percent_off <= 100)))),
    CONSTRAINT promo_codes_type_check CHECK (((discount_type)::text = ANY ((ARRAY['percent'::character varying, 'amount'::character varying, 'free_days'::character varying])::text[])))
);

CREATE TABLE public.promo_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promo_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount_off_cents integer,
    payment_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.promotion_views (
    promotion_id uuid NOT NULL,
    user_id uuid NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    day_key character varying(10) NOT NULL,
    day_count integer DEFAULT 0 NOT NULL,
    clicked boolean DEFAULT false NOT NULL,
    first_seen_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    fcm_token text NOT NULL,
    platform text NOT NULL,
    last_seen_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.referral_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code character varying(24) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referee_id uuid NOT NULL,
    code character varying(24) NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    referrer_role character varying(16) NOT NULL,
    referee_role character varying(16) NOT NULL,
    referrer_reward jsonb DEFAULT '{}'::jsonb NOT NULL,
    referee_reward jsonb DEFAULT '{}'::jsonb NOT NULL,
    qualified_at timestamp with time zone,
    rewarded_at timestamp with time zone,
    rejected_reason character varying(300),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT referrals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'qualified'::character varying, 'rewarded'::character varying, 'rejected'::character varying])::text[])))
);

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    reason character varying(500) NOT NULL,
    status character varying(16) NOT NULL,
    stripe_refund_id text,
    failure_reason text,
    admin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT refunds_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[])))
);

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    target_type public.report_target_type NOT NULL,
    target_id uuid NOT NULL,
    reason public.report_reason NOT NULL,
    note text,
    status public.report_status DEFAULT 'open'::public.report_status NOT NULL,
    handled_by uuid,
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.review_helpful_votes (
    review_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid,
    client_id uuid NOT NULL,
    attorney_id uuid NOT NULL,
    rating smallint NOT NULL,
    body text,
    status public.review_status DEFAULT 'published'::public.review_status NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    edited_at timestamp with time zone,
    reply character varying(1000),
    reply_at timestamp with time zone,
    helpful_count integer DEFAULT 0 NOT NULL,
    photo_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT reviews_body_len CHECK ((char_length(body) <= 1000)),
    CONSTRAINT reviews_rating_ck CHECK (((rating >= 1) AND (rating <= 5)))
);

CREATE TABLE public.saved_items (
    user_id uuid NOT NULL,
    item_type public.saved_item_type NOT NULL,
    item_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.seat_limit_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    requested_seats smallint NOT NULL,
    note character varying(1000),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    granted_seats smallint,
    decision_note character varying(500),
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_id text,
    device_name text,
    platform text,
    app_version text,
    ip text,
    user_agent text,
    refresh_hash text NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason text,
    replaced_by_session_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    session_chain_id uuid NOT NULL
);

CREATE TABLE public.staff_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period character varying(20) NOT NULL,
    department character varying(24) NOT NULL,
    admin_id uuid NOT NULL,
    rank integer DEFAULT 1 NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    prize character varying(200) DEFAULT ''::character varying NOT NULL,
    bonus_cents integer DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    accrual_id uuid,
    auto boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.state_bar_registries (
    state_code character(2) NOT NULL,
    adapter text DEFAULT 'manual'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    secret_enc text,
    secret_masked text,
    test_bar_number text,
    last_test_at timestamp with time zone,
    last_test_result jsonb,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.states (
    code character(2) NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    country_code character(2) DEFAULT 'US'::bpchar NOT NULL,
    iso_code text
);

CREATE TABLE public.sticker_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid,
    title character varying(64) NOT NULL,
    short_name character varying(40) NOT NULL,
    is_official boolean DEFAULT false NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    sticker_count integer DEFAULT 0 NOT NULL,
    install_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT sticker_packs_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'hidden'::character varying])::text[])))
);

CREATE TABLE public.stickers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pack_id uuid NOT NULL,
    file_id uuid NOT NULL,
    emoji character varying(16) DEFAULT '🙂'::character varying NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

CREATE TABLE public.storage_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    day date NOT NULL,
    files_bytes bigint NOT NULL,
    stored_bytes bigint NOT NULL,
    files_count integer NOT NULL,
    by_purpose jsonb NOT NULL,
    db_tables jsonb NOT NULL,
    db_bytes bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.stripe_customers (
    user_id uuid NOT NULL,
    stripe_customer_id text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.stripe_webhook_events (
    stripe_event_id text NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    processed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_subscription_id text,
    status public.subscription_status NOT NULL,
    price_cents integer NOT NULL,
    trial_started_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    canceled_at timestamp with time zone,
    card_fingerprint text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    grace_ends_at timestamp with time zone,
    plan public.subscription_plan DEFAULT 'monthly'::public.subscription_plan NOT NULL,
    assistant_seats smallint DEFAULT 0 NOT NULL,
    plan_id uuid,
    entitlements jsonb,
    CONSTRAINT subscriptions_assistant_seats_range CHECK (((assistant_seats >= 0) AND (assistant_seats <= 50))),
    CONSTRAINT subscriptions_price_cents_ck CHECK ((price_cents >= 0))
);

CREATE TABLE public.support_agents (
    admin_id uuid NOT NULL,
    on_shift boolean DEFAULT false NOT NULL,
    max_open integer DEFAULT 25 NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.support_macros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(120) NOT NULL,
    body character varying(5000) NOT NULL,
    category character varying(20),
    active boolean DEFAULT true NOT NULL,
    uses integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_user_id uuid,
    author_admin_id uuid,
    internal boolean DEFAULT false NOT NULL,
    body character varying(5000) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    auto boolean DEFAULT false NOT NULL
);

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject character varying(200) NOT NULL,
    category character varying(20) DEFAULT 'other'::character varying NOT NULL,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    priority character varying(8) DEFAULT 'normal'::character varying NOT NULL,
    assignee_id uuid,
    unread_by_admin boolean DEFAULT true NOT NULL,
    unread_by_user boolean DEFAULT false NOT NULL,
    last_message_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    assigned_at timestamp with time zone,
    first_response_at timestamp with time zone,
    first_response_by uuid,
    resolved_by uuid,
    sla_due_at timestamp with time zone,
    sla_breached_at timestamp with time zone,
    country_code character(2) DEFAULT 'US'::bpchar NOT NULL,
    CONSTRAINT support_tickets_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'waiting_user'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[])))
);

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tag_lower text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.treasury_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(80) NOT NULL,
    monthly_cents integer NOT NULL,
    source character varying(16) DEFAULT 'manual'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.treasury_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(80) NOT NULL,
    period character varying(7) NOT NULL,
    kind character varying(16) NOT NULL,
    trigger character varying(8) DEFAULT 'auto'::character varying NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    destination_id character varying(64),
    destination_label character varying(80),
    stripe_payout_id character varying(64),
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    failure character varying(300),
    plan jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_blocks (
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    consent_type public.consent_type NOT NULL,
    document_id uuid,
    granted boolean NOT NULL,
    ip text,
    device_id text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.user_identifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider public.identifier_type NOT NULL,
    provider_uid text NOT NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.user_recent_stickers (
    user_id uuid NOT NULL,
    sticker_id uuid NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_sticker_packs (
    user_id uuid NOT NULL,
    pack_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role public.user_role,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    first_name text,
    last_name text,
    avatar_file_id uuid,
    email text,
    email_verified_at timestamp with time zone,
    phone_e164 text,
    phone_verified_at timestamp with time zone,
    ui_language text DEFAULT 'en'::text NOT NULL,
    theme public.theme_pref DEFAULT 'system'::public.theme_pref NOT NULL,
    suspended_reason text,
    last_active_at timestamp with time zone,
    deletion_requested_at timestamp with time zone,
    deleted_at timestamp with time zone,
    anonymized_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    full_name_lower text GENERATED ALWAYS AS (lower(((COALESCE(first_name, ''::text) || ' '::text) || COALESCE(last_name, ''::text)))) STORED,
    show_activity_status boolean DEFAULT true NOT NULL,
    country_code character(2) DEFAULT 'US'::bpchar NOT NULL,
    storage_quota_mb integer,
    placeholder_kind character varying(24),
    copyright_strikes integer DEFAULT 0 NOT NULL,
    feed_content_mode character varying(16),
    phone_sha256 text GENERATED ALWAYS AS (encode(sha256((phone_e164)::bytea), 'hex'::text)) STORED,
    password_hash text,
    password_set_at timestamp with time zone
);

CREATE TABLE public.verification_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    check_type public.verification_check_type NOT NULL,
    provider public.verification_provider NOT NULL,
    result public.check_result NOT NULL,
    details jsonb NOT NULL,
    checked_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.verification_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    doc_type public.verification_doc_type NOT NULL,
    file_id uuid NOT NULL,
    state_code character(2),
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    side text,
    CONSTRAINT verification_documents_side_ck CHECK ((side = ANY (ARRAY['front'::text, 'back'::text])))
);

CREATE TABLE public.verification_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attorney_id uuid NOT NULL,
    status public.verification_request_status NOT NULL,
    provider public.verification_provider DEFAULT 'manual'::public.verification_provider NOT NULL,
    provider_ref text,
    submitted_at timestamp with time zone,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    admin_note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    applicant_comment text,
    info_request_message text,
    rejection_code text,
    attested_at timestamp with time zone,
    attestation_ip text,
    attestation_version text,
    CONSTRAINT verification_requests_applicant_comment_len CHECK ((char_length(applicant_comment) <= 500))
);

CREATE TABLE public.video_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    provider text DEFAULT 'bunny'::text NOT NULL,
    library_id text NOT NULL,
    external_id text NOT NULL,
    status public.video_asset_status DEFAULT 'awaiting_upload'::public.video_asset_status NOT NULL,
    duration_sec integer,
    width integer,
    height integer,
    storage_bytes bigint,
    failure_reason text,
    upload_expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ready_at timestamp with time zone,
    deleted_at timestamp with time zone,
    purged_at timestamp with time zone,
    trim_start_ms integer,
    trim_end_ms integer,
    cover_time_ms integer
);

ALTER TABLE ONLY public.account_bans
    ADD CONSTRAINT account_bans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_broadcasts
    ADD CONSTRAINT admin_broadcasts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_credentials
    ADD CONSTRAINT admin_credentials_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.admin_profiles
    ADD CONSTRAINT admin_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.admin_role_templates
    ADD CONSTRAINT admin_role_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.assistant_activity
    ADD CONSTRAINT assistant_activity_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_liability_acceptances
    ADD CONSTRAINT assistant_liability_acceptances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_memberships
    ADD CONSTRAINT assistant_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assistant_requests
    ADD CONSTRAINT assistant_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attorney_licenses
    ADD CONSTRAINT attorney_licenses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attorney_practice_areas
    ADD CONSTRAINT attorney_practice_areas_pkey PRIMARY KEY (attorney_id, practice_area_id);

ALTER TABLE ONLY public.attorney_profiles
    ADD CONSTRAINT attorney_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.attorney_task_people
    ADD CONSTRAINT attorney_task_people_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attorney_task_places
    ADD CONSTRAINT attorney_task_places_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attorney_task_steps
    ADD CONSTRAINT attorney_task_steps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attorney_tasks
    ADD CONSTRAINT attorney_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attorney_trust_events
    ADD CONSTRAINT attorney_trust_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attorney_trust
    ADD CONSTRAINT attorney_trust_pkey PRIMARY KEY (attorney_id);

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bar_number_block_events
    ADD CONSTRAINT bar_number_block_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bar_number_blocks
    ADD CONSTRAINT bar_number_blocks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bid_drafts
    ADD CONSTRAINT bid_drafts_attorney_case_key UNIQUE (attorney_id, case_id);

ALTER TABLE ONLY public.bid_drafts
    ADD CONSTRAINT bid_drafts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bid_offers
    ADD CONSTRAINT bid_offers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.blocked_email_domains
    ADD CONSTRAINT blocked_email_domains_pkey PRIMARY KEY (domain);

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_comment_likes
    ADD CONSTRAINT case_comment_likes_pkey PRIMARY KEY (comment_id, user_id);

ALTER TABLE ONLY public.case_comments
    ADD CONSTRAINT case_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_disputes
    ADD CONSTRAINT case_disputes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_invites
    ADD CONSTRAINT case_invites_case_attorney_key UNIQUE (case_id, attorney_id);

ALTER TABLE ONLY public.case_invites
    ADD CONSTRAINT case_invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_journal
    ADD CONSTRAINT case_journal_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_payment_refunds
    ADD CONSTRAINT case_payment_refunds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_payments
    ADD CONSTRAINT case_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_photos
    ADD CONSTRAINT case_photos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_promotions
    ADD CONSTRAINT case_promotions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_reads
    ADD CONSTRAINT case_reads_pkey PRIMARY KEY (case_id, user_id);

ALTER TABLE ONLY public.case_shares
    ADD CONSTRAINT case_shares_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_states
    ADD CONSTRAINT case_states_pkey PRIMARY KEY (case_id, state_code);

ALTER TABLE ONLY public.case_task_events
    ADD CONSTRAINT case_task_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_task_items
    ADD CONSTRAINT case_task_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_tasks
    ADD CONSTRAINT case_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.case_updates
    ADD CONSTRAINT case_updates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_fraud_events
    ADD CONSTRAINT client_fraud_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_fraud_profiles
    ADD CONSTRAINT client_fraud_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.client_profiles
    ADD CONSTRAINT client_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.client_review_appeals
    ADD CONSTRAINT client_review_appeals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_review_helpful_votes
    ADD CONSTRAINT client_review_helpful_votes_pkey PRIMARY KEY (review_id, user_id);

ALTER TABLE ONLY public.client_reviews
    ADD CONSTRAINT client_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_subscriptions
    ADD CONSTRAINT client_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_verifications
    ADD CONSTRAINT client_verifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id);

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.connected_customers
    ADD CONSTRAINT connected_customers_pkey PRIMARY KEY (client_id, stripe_account_id);

ALTER TABLE ONLY public.contact_disclosures
    ADD CONSTRAINT contact_disclosures_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contact_issue_reports
    ADD CONSTRAINT contact_issue_reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contact_matches
    ADD CONSTRAINT contact_matches_pkey PRIMARY KEY (owner_id, matched_id);

ALTER TABLE ONLY public.contact_sync_settings
    ADD CONSTRAINT contact_sync_settings_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.contract_grants
    ADD CONSTRAINT contract_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (conversation_id, user_id);

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.country_partner_settlements
    ADD CONSTRAINT country_partner_settlements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.country_partners
    ADD CONSTRAINT country_partners_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.country_waitlist
    ADD CONSTRAINT country_waitlist_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.data_access_log
    ADD CONSTRAINT data_access_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.data_access_requests
    ADD CONSTRAINT data_access_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.data_export_jobs
    ADD CONSTRAINT data_export_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.demo_accounts
    ADD CONSTRAINT demo_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.dmca_notices
    ADD CONSTRAINT dmca_notices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (key, locale);

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, followee_id);

ALTER TABLE ONLY public.i18n_bundle_versions
    ADD CONSTRAINT i18n_bundle_versions_pkey PRIMARY KEY (lang);

ALTER TABLE ONLY public.i18n_keys
    ADD CONSTRAINT i18n_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.i18n_languages
    ADD CONSTRAINT i18n_languages_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.i18n_translations
    ADD CONSTRAINT i18n_translations_pkey PRIMARY KEY (key_id, lang);

ALTER TABLE ONLY public.identity_fingerprints
    ADD CONSTRAINT identity_fingerprints_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.integration_credentials
    ADD CONSTRAINT integration_credentials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.integration_custom_providers
    ADD CONSTRAINT integration_custom_providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_documents
    ADD CONSTRAINT legal_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.new_case_alert_practices
    ADD CONSTRAINT new_case_alert_practices_pkey PRIMARY KEY (attorney_id, practice_area_id);

ALTER TABLE ONLY public.notification_quiet_hours
    ADD CONSTRAINT notification_quiet_hours_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (user_id, category);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.onboarding_state
    ADD CONSTRAINT onboarding_state_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.outreach_activities
    ADD CONSTRAINT outreach_activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.outreach_leads
    ADD CONSTRAINT outreach_leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.outreach_suppressions
    ADD CONSTRAINT outreach_suppressions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.outreach_templates
    ADD CONSTRAINT outreach_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.partner_commissions
    ADD CONSTRAINT partner_commissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_requests
    ADD CONSTRAINT payment_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payout_accounts
    ADD CONSTRAINT payout_accounts_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.payroll_accruals
    ADD CONSTRAINT payroll_accruals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payroll_employees
    ADD CONSTRAINT payroll_employees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payroll_payouts
    ADD CONSTRAINT payroll_payouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plan_prices
    ADD CONSTRAINT plan_prices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_attachments
    ADD CONSTRAINT post_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_reposts
    ADD CONSTRAINT post_reposts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_shares
    ADD CONSTRAINT post_shares_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_tags
    ADD CONSTRAINT post_tags_pkey PRIMARY KEY (post_id, tag_id);

ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.practice_areas
    ADD CONSTRAINT practice_areas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_views
    ADD CONSTRAINT promotion_views_pkey PRIMARY KEY (promotion_id, user_id);

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.review_helpful_votes
    ADD CONSTRAINT review_helpful_votes_pkey PRIMARY KEY (review_id, user_id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.saved_items
    ADD CONSTRAINT saved_items_pkey PRIMARY KEY (user_id, item_type, item_id);

ALTER TABLE ONLY public.seat_limit_requests
    ADD CONSTRAINT seat_limit_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_rewards
    ADD CONSTRAINT staff_rewards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.state_bar_registries
    ADD CONSTRAINT state_bar_registries_pkey PRIMARY KEY (state_code);

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_pkey PRIMARY KEY (code);

ALTER TABLE ONLY public.sticker_packs
    ADD CONSTRAINT sticker_packs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stickers
    ADD CONSTRAINT stickers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.storage_snapshots
    ADD CONSTRAINT storage_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stripe_customers
    ADD CONSTRAINT stripe_customers_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (stripe_event_id);

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_agents
    ADD CONSTRAINT support_agents_pkey PRIMARY KEY (admin_id);

ALTER TABLE ONLY public.support_macros
    ADD CONSTRAINT support_macros_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.treasury_expenses
    ADD CONSTRAINT treasury_expenses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.treasury_payouts
    ADD CONSTRAINT treasury_payouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_identifiers
    ADD CONSTRAINT user_identifiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_recent_stickers
    ADD CONSTRAINT user_recent_stickers_pkey PRIMARY KEY (user_id, sticker_id);

ALTER TABLE ONLY public.user_sticker_packs
    ADD CONSTRAINT user_sticker_packs_pkey PRIMARY KEY (user_id, pack_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.verification_checks
    ADD CONSTRAINT verification_checks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.verification_documents
    ADD CONSTRAINT verification_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_pkey PRIMARY KEY (id);

CREATE INDEX account_bans_created_at_idx ON public.account_bans USING btree (created_at);

CREATE INDEX account_bans_kind_value_idx ON public.account_bans USING btree (kind, value);

CREATE UNIQUE INDEX admin_credentials_login_key ON public.admin_credentials USING btree (login);

CREATE UNIQUE INDEX admin_role_templates_name_key ON public.admin_role_templates USING btree (name);

CREATE INDEX assistant_activity_attorney_id_created_at_idx ON public.assistant_activity USING btree (attorney_id, created_at DESC);

CREATE INDEX assistant_activity_created_at_idx ON public.assistant_activity USING btree (created_at);

CREATE INDEX assistant_activity_membership_id_created_at_idx ON public.assistant_activity USING btree (membership_id, created_at DESC);

CREATE INDEX assistant_liability_by_attorney ON public.assistant_liability_acceptances USING btree (attorney_id, created_at DESC);

CREATE INDEX assistant_memberships_assistant_user_id_idx ON public.assistant_memberships USING btree (assistant_user_id);

CREATE INDEX assistant_memberships_attorney_id_status_idx ON public.assistant_memberships USING btree (attorney_id, status);

CREATE UNIQUE INDEX assistant_memberships_join_code_hash_key ON public.assistant_memberships USING btree (join_code_hash);

CREATE UNIQUE INDEX assistant_memberships_live_phone_key ON public.assistant_memberships USING btree (phone_e164) WHERE (status <> 'removed'::public.assistant_status);

CREATE INDEX assistant_memberships_phone_e164_status_idx ON public.assistant_memberships USING btree (phone_e164, status);

CREATE INDEX assistant_requests_attorney_id_status_created_at_idx ON public.assistant_requests USING btree (attorney_id, status, created_at DESC);

CREATE INDEX attorney_licenses_attorney_id_idx ON public.attorney_licenses USING btree (attorney_id);

CREATE INDEX attorney_licenses_license_status_expires_at_idx ON public.attorney_licenses USING btree (license_status, expires_at);

CREATE INDEX attorney_licenses_registry_flag_idx ON public.attorney_licenses USING btree (registry_flag);

CREATE UNIQUE INDEX attorney_licenses_state_code_bar_number_key ON public.attorney_licenses USING btree (state_code, bar_number);

CREATE INDEX attorney_licenses_state_code_license_status_idx ON public.attorney_licenses USING btree (state_code, license_status);

CREATE INDEX attorney_practice_areas_practice_area_id_attorney_id_idx ON public.attorney_practice_areas USING btree (practice_area_id, attorney_id);

CREATE INDEX attorney_profiles_languages_idx ON public.attorney_profiles USING gin (languages);

CREATE UNIQUE INDEX attorney_profiles_username_lower_key ON public.attorney_profiles USING btree (username_lower);

CREATE INDEX attorney_profiles_username_trgm_idx ON public.attorney_profiles USING gin (username_lower public.gin_trgm_ops) WHERE (username_lower IS NOT NULL);

CREATE INDEX attorney_task_people_task_idx ON public.attorney_task_people USING btree (task_id, "position");

CREATE INDEX attorney_task_people_user_idx ON public.attorney_task_people USING btree (user_id);

CREATE INDEX attorney_task_places_task_idx ON public.attorney_task_places USING btree (task_id, "position");

CREATE INDEX attorney_task_steps_task_idx ON public.attorney_task_steps USING btree (task_id, "position");

CREATE INDEX attorney_tasks_archived_idx ON public.attorney_tasks USING btree (archived_at);

CREATE INDEX attorney_tasks_attorney_id_status_due_at_idx ON public.attorney_tasks USING btree (attorney_id, status, due_at);

CREATE INDEX attorney_tasks_file_ids_idx ON public.attorney_tasks USING gin (file_ids);

CREATE INDEX attorney_tasks_remind_idx ON public.attorney_tasks USING btree (remind_at);

CREATE INDEX attorney_trust_bids_hold_idx ON public.attorney_trust USING btree (bids_hold);

CREATE INDEX attorney_trust_events_attorney_id_created_at_idx ON public.attorney_trust_events USING btree (attorney_id, created_at DESC);

CREATE INDEX attorney_trust_events_kind_created_at_idx ON public.attorney_trust_events USING btree (kind, created_at DESC);

CREATE INDEX attorney_trust_level_idx ON public.attorney_trust USING btree (level);

CREATE INDEX attorney_trust_payments_hold_idx ON public.attorney_trust USING btree (payments_hold);

CREATE INDEX audit_log_admin_id_created_at_idx ON public.audit_log USING btree (admin_id, created_at DESC);

CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_shard, created_at);

CREATE INDEX auth_events_created_at_idx ON public.auth_events USING btree (created_shard, created_at);

CREATE INDEX auth_events_user_id_created_at_idx ON public.auth_events USING btree (user_id, created_at DESC);

CREATE INDEX bar_number_block_events_block_id_created_at_idx ON public.bar_number_block_events USING btree (block_id, created_at DESC);

CREATE INDEX bar_number_blocks_active_blocked_at_idx ON public.bar_number_blocks USING btree (active, blocked_at DESC);

CREATE INDEX bar_number_blocks_email_lower_idx ON public.bar_number_blocks USING btree (email_lower);

CREATE INDEX bar_number_blocks_phone_e164_idx ON public.bar_number_blocks USING btree (phone_e164);

CREATE UNIQUE INDEX bar_number_blocks_state_code_bar_key_key ON public.bar_number_blocks USING btree (state_code, bar_key);

CREATE UNIQUE INDEX bid_offers_bid_id_round_no_key ON public.bid_offers USING btree (bid_id, round_no);

CREATE INDEX bids_attorney_id_status_updated_at_idx ON public.bids USING btree (attorney_id, status, updated_at DESC);

CREATE INDEX bids_attorney_updated_idx ON public.bids USING btree (attorney_id, updated_at DESC, id DESC);

CREATE UNIQUE INDEX bids_case_id_attorney_id_key ON public.bids USING btree (case_id, attorney_id);

CREATE INDEX bids_case_id_status_idx ON public.bids USING btree (case_id, status);

CREATE INDEX bids_status_idx ON public.bids USING btree (status);

CREATE INDEX calls_callee_id_status_idx ON public.calls USING btree (callee_id, status);

CREATE INDEX calls_caller_id_status_idx ON public.calls USING btree (caller_id, status);

CREATE INDEX calls_conversation_id_created_at_idx ON public.calls USING btree (conversation_id, created_at);

CREATE INDEX calls_status_created_at_idx ON public.calls USING btree (status, created_at);

CREATE INDEX case_comments_case_id_created_at_idx ON public.case_comments USING btree (case_id, created_at);

CREATE INDEX case_comments_parent_comment_id_created_at_idx ON public.case_comments USING btree (parent_comment_id, created_at);

CREATE INDEX case_disputes_case_id_idx ON public.case_disputes USING btree (case_id);

CREATE INDEX case_invites_attorney_status_idx ON public.case_invites USING btree (attorney_id, status);

CREATE INDEX case_invites_client_created_idx ON public.case_invites USING btree (client_id, created_at);

CREATE INDEX case_journal_attorney_id_created_at_idx ON public.case_journal USING btree (attorney_id, created_at);

CREATE INDEX case_journal_case_id_created_at_idx ON public.case_journal USING btree (case_id, created_at);

CREATE INDEX case_journal_client_id_created_at_idx ON public.case_journal USING btree (client_id, created_at);

CREATE INDEX case_journal_created_at_idx ON public.case_journal USING btree (created_at);

CREATE INDEX case_journal_retain_until_idx ON public.case_journal USING btree (retain_until);

CREATE INDEX case_payment_refunds_payment_id_idx ON public.case_payment_refunds USING btree (payment_id);

CREATE UNIQUE INDEX case_payment_refunds_stripe_refund_id_key ON public.case_payment_refunds USING btree (stripe_refund_id);

CREATE INDEX case_payments_attorney_id_created_at_idx ON public.case_payments USING btree (attorney_id, created_at DESC);

CREATE INDEX case_payments_case_id_created_at_idx ON public.case_payments USING btree (case_id, created_at DESC);

CREATE INDEX case_payments_client_id_created_at_idx ON public.case_payments USING btree (client_id, created_at DESC);

CREATE INDEX case_payments_request_id_idx ON public.case_payments USING btree (request_id);

CREATE INDEX case_payments_status_created_at_idx ON public.case_payments USING btree (status, created_at DESC);

CREATE UNIQUE INDEX case_payments_stripe_checkout_id_key ON public.case_payments USING btree (stripe_checkout_id);

CREATE UNIQUE INDEX case_payments_stripe_payment_intent_id_key ON public.case_payments USING btree (stripe_payment_intent_id);

CREATE UNIQUE INDEX case_photos_case_id_position_key ON public.case_photos USING btree (case_id, "position");

CREATE INDEX case_photos_file_id_idx ON public.case_photos USING btree (file_id);

CREATE INDEX case_photos_source_source_id_idx ON public.case_photos USING btree (source, source_id);

CREATE INDEX case_promotions_case_id_idx ON public.case_promotions USING btree (case_id);

CREATE INDEX case_promotions_post_id_idx ON public.case_promotions USING btree (post_id);

CREATE INDEX case_promotions_status_ends_at_idx ON public.case_promotions USING btree (status, ends_at);

CREATE UNIQUE INDEX case_promotions_stripe_checkout_id_key ON public.case_promotions USING btree (stripe_checkout_id);

CREATE INDEX case_promotions_target_type_status_ends_at_idx ON public.case_promotions USING btree (target_type, status, ends_at);

CREATE INDEX case_promotions_user_id_created_at_idx ON public.case_promotions USING btree (user_id, created_at DESC);

CREATE INDEX case_shares_case_id_idx ON public.case_shares USING btree (case_id);

CREATE UNIQUE INDEX case_states_one_primary_uq ON public.case_states USING btree (case_id) WHERE is_primary;

CREATE INDEX case_states_state_code_case_id_idx ON public.case_states USING btree (state_code, case_id);

CREATE INDEX case_task_events_case_id_created_at_idx ON public.case_task_events USING btree (case_id, created_at);

CREATE INDEX case_task_events_task_id_created_at_idx ON public.case_task_events USING btree (task_id, created_at);

CREATE INDEX case_task_items_task_id_position_idx ON public.case_task_items USING btree (task_id, "position");

CREATE INDEX case_tasks_case_id_created_at_idx ON public.case_tasks USING btree (case_id, created_at);

CREATE INDEX case_updates_case_id_created_at_idx ON public.case_updates USING btree (case_id, created_at);

CREATE UNIQUE INDEX cases_accepted_bid_id_key ON public.cases USING btree (accepted_bid_id);

CREATE INDEX cases_auto_close_idx ON public.cases USING btree (auto_close_at) WHERE (status = 'pending_completion'::public.case_status);

CREATE INDEX cases_client_idx ON public.cases USING btree (client_id, status, created_at DESC) WHERE (deleted_at IS NULL);

CREATE INDEX cases_deadline_at_idx ON public.cases USING btree (deadline_at);

CREATE INDEX cases_open_activity_idx ON public.cases USING btree (last_activity_at) WHERE (status = 'open'::public.case_status);

CREATE INDEX cases_open_feed_idx ON public.cases USING btree (primary_state_code, practice_area_id, created_at DESC) WHERE ((status = 'open'::public.case_status) AND (deleted_at IS NULL));

CREATE INDEX cases_open_practice_idx ON public.cases USING btree (practice_area_id, created_at DESC) WHERE ((status = 'open'::public.case_status) AND (deleted_at IS NULL));

CREATE INDEX cases_open_prompted_idx ON public.cases USING btree (stale_prompt_sent_at, id) WHERE ((status = 'open'::public.case_status) AND (stale_prompt_sent_at IS NOT NULL) AND (deleted_at IS NULL));

CREATE INDEX cases_open_unprompted_idx ON public.cases USING btree (last_activity_at, id) WHERE ((status = 'open'::public.case_status) AND (stale_prompt_sent_at IS NULL) AND (deleted_at IS NULL));

CREATE INDEX cases_search_tsv_idx ON public.cases USING gin (search_tsv);

CREATE INDEX cases_search_tsv_simple_idx ON public.cases USING gin (search_tsv_simple);

CREATE INDEX cases_status_closed_at_idx ON public.cases USING btree (status, closed_at);

CREATE INDEX client_fraud_events_actor_id_created_at_idx ON public.client_fraud_events USING btree (actor_id, created_at DESC);

CREATE INDEX client_fraud_events_kind_created_at_idx ON public.client_fraud_events USING btree (kind, created_at DESC);

CREATE INDEX client_fraud_events_user_id_created_at_idx ON public.client_fraud_events USING btree (user_id, created_at DESC);

CREATE INDEX client_fraud_profiles_status_score_idx ON public.client_fraud_profiles USING btree (status, score DESC);

CREATE INDEX client_profiles_languages_idx ON public.client_profiles USING gin (preferred_languages);

CREATE UNIQUE INDEX client_profiles_username_lower_key ON public.client_profiles USING btree (username_lower);

CREATE INDEX client_profiles_username_trgm_idx ON public.client_profiles USING gin (username_lower public.gin_trgm_ops) WHERE (username_lower IS NOT NULL);

CREATE UNIQUE INDEX client_review_appeals_review_id_key ON public.client_review_appeals USING btree (review_id);

CREATE INDEX client_review_appeals_status_auto_remove_at_idx ON public.client_review_appeals USING btree (status, auto_remove_at);

CREATE INDEX client_review_appeals_status_created_at_idx ON public.client_review_appeals USING btree (status, created_at);

CREATE UNIQUE INDEX client_reviews_case_id_attorney_id_key ON public.client_reviews USING btree (case_id, attorney_id);

CREATE INDEX client_reviews_client_id_attorney_id_idx ON public.client_reviews USING btree (client_id, attorney_id);

CREATE INDEX client_reviews_client_id_created_at_idx ON public.client_reviews USING btree (client_id, created_at DESC);

CREATE INDEX client_reviews_photo_ids_idx ON public.client_reviews USING gin (photo_ids);

CREATE INDEX client_subscriptions_status_idx ON public.client_subscriptions USING btree (status, current_period_end);

CREATE UNIQUE INDEX client_subscriptions_stripe_subscription_id_key ON public.client_subscriptions USING btree (stripe_subscription_id);

CREATE UNIQUE INDEX client_subscriptions_user_id_key ON public.client_subscriptions USING btree (user_id);

CREATE INDEX client_verifications_queue_idx ON public.client_verifications USING btree (status, submitted_at DESC);

CREATE UNIQUE INDEX client_verifications_stripe_subscription_id_key ON public.client_verifications USING btree (stripe_subscription_id);

CREATE UNIQUE INDEX client_verifications_user_id_key ON public.client_verifications USING btree (user_id);

CREATE INDEX comments_parent_comment_id_created_at_idx ON public.comments USING btree (parent_comment_id, created_at);

CREATE INDEX comments_post_id_created_at_idx ON public.comments USING btree (post_id, created_at);

CREATE UNIQUE INDEX contact_disclosures_bid_id_key ON public.contact_disclosures USING btree (bid_id);

CREATE INDEX contact_issue_reports_status_created_at_idx ON public.contact_issue_reports USING btree (status, created_at);

CREATE INDEX contact_matches_matched_id_idx ON public.contact_matches USING btree (matched_id);

CREATE INDEX contract_grants_ends_at_idx ON public.contract_grants USING btree (ends_at);

CREATE INDEX contract_grants_user_id_ends_at_idx ON public.contract_grants USING btree (user_id, ends_at);

CREATE INDEX conversation_participants_user_id_idx ON public.conversation_participants USING btree (user_id);

CREATE INDEX conversation_participants_waiting_idx ON public.conversation_participants USING btree (user_id, waiting_since) WHERE (waiting_since IS NOT NULL);

CREATE INDEX conversations_attorney_id_last_message_at_idx ON public.conversations USING btree (attorney_id, last_message_at DESC);

CREATE UNIQUE INDEX conversations_case_id_attorney_id_key ON public.conversations USING btree (case_id, attorney_id);

CREATE INDEX conversations_client_id_last_message_at_idx ON public.conversations USING btree (client_id, last_message_at DESC);

CREATE UNIQUE INDEX conversations_direct_pair_key ON public.conversations USING btree (attorney_id, client_id) WHERE (case_id IS NULL);

CREATE UNIQUE INDEX conversations_direct_uq ON public.conversations USING btree (attorney_id, client_id) WHERE (case_id IS NULL);

CREATE INDEX countries_is_enabled_sort_idx ON public.countries USING btree (is_enabled, sort);

CREATE UNIQUE INDEX country_partner_settlements_partner_id_period_currency_key ON public.country_partner_settlements USING btree (partner_id, period, currency);

CREATE INDEX country_partner_settlements_status_period_idx ON public.country_partner_settlements USING btree (status, period);

CREATE INDEX country_partners_country_code_status_idx ON public.country_partners USING btree (country_code, status);

CREATE UNIQUE INDEX country_partners_lead_admin_id_key ON public.country_partners USING btree (lead_admin_id);

CREATE UNIQUE INDEX country_waitlist_country_code_email_key ON public.country_waitlist USING btree (country_code, email);

CREATE INDEX country_waitlist_country_code_notified_at_idx ON public.country_waitlist USING btree (country_code, notified_at);

CREATE INDEX data_access_log_request_id_idx ON public.data_access_log USING btree (request_id);

CREATE INDEX data_export_jobs_status_expires_at_idx ON public.data_export_jobs USING btree (status, expires_at);

CREATE INDEX data_export_jobs_user_id_created_at_idx ON public.data_export_jobs USING btree (user_id, created_at DESC);

CREATE INDEX demo_accounts_created_by_user_id_created_at_idx ON public.demo_accounts USING btree (created_by_user_id, created_at);

CREATE UNIQUE INDEX demo_accounts_demo_user_id_key ON public.demo_accounts USING btree (demo_user_id);

CREATE UNIQUE INDEX demo_accounts_invite_code_hash_key ON public.demo_accounts USING btree (invite_code_hash);

CREATE INDEX demo_accounts_last_seen_at_idx ON public.demo_accounts USING btree (last_seen_at);

CREATE INDEX dmca_notices_status_created_at_idx ON public.dmca_notices USING btree (status, created_at);

CREATE INDEX dmca_notices_submitted_by_user_id_idx ON public.dmca_notices USING btree (submitted_by_user_id);

CREATE INDEX dmca_notices_target_type_target_id_idx ON public.dmca_notices USING btree (target_type, target_id);

CREATE UNIQUE INDEX document_templates_file_id_key ON public.document_templates USING btree (file_id);

CREATE INDEX document_templates_is_published_deleted_at_created_at_idx ON public.document_templates USING btree (is_published, deleted_at, created_at);

CREATE INDEX document_templates_practice_area_id_idx ON public.document_templates USING btree (practice_area_id);

CREATE INDEX files_deleted_at_created_at_idx ON public.files USING btree (deleted_at, created_at);

CREATE INDEX files_owner_user_id_idx ON public.files USING btree (owner_user_id);

CREATE INDEX files_s3_bucket_s3_key_idx ON public.files USING btree (s3_bucket, s3_key);

CREATE INDEX files_s3_bucket_source_sha256_idx ON public.files USING btree (s3_bucket, source_sha256);

CREATE INDEX follows_followee_id_follower_id_idx ON public.follows USING btree (followee_id, follower_id);

CREATE UNIQUE INDEX i18n_keys_key_key ON public.i18n_keys USING btree (key);

CREATE INDEX identity_fingerprints_kind_hash_idx ON public.identity_fingerprints USING btree (kind, hash);

CREATE INDEX identity_fingerprints_last_seen_at_idx ON public.identity_fingerprints USING btree (last_seen_at);

CREATE UNIQUE INDEX identity_fingerprints_user_id_kind_hash_key ON public.identity_fingerprints USING btree (user_id, kind, hash);

CREATE UNIQUE INDEX integration_credentials_one_active_slot ON public.integration_credentials USING btree (provider, slot) WHERE (status = 'active'::public.integration_credential_status);

CREATE UNIQUE INDEX integration_credentials_provider_version_key ON public.integration_credentials USING btree (provider, version);

CREATE INDEX legal_documents_doc_type_locale_status_idx ON public.legal_documents USING btree (doc_type, locale, status);

CREATE UNIQUE INDEX legal_documents_doc_type_version_locale_key ON public.legal_documents USING btree (doc_type, version, locale);

CREATE INDEX messages_conversation_id_created_at_idx ON public.messages USING btree (conversation_id, created_at DESC);

CREATE UNIQUE INDEX messages_conversation_id_sender_id_client_message_id_key ON public.messages USING btree (conversation_id, sender_id, client_message_id);

CREATE INDEX messages_file_id_idx ON public.messages USING btree (file_id);

CREATE INDEX messages_sender_id_idx ON public.messages USING btree (sender_id);

CREATE INDEX messages_sticker_id_idx ON public.messages USING btree (sticker_id);

CREATE INDEX moderation_actions_target_type_target_id_idx ON public.moderation_actions USING btree (target_type, target_id);

CREATE INDEX new_case_alert_practices_area_idx ON public.new_case_alert_practices USING btree (practice_area_id, attorney_id);

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);

CREATE UNIQUE INDEX notifications_user_dedupe_uq ON public.notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);

CREATE INDEX notifications_user_id_created_at_idx ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);

CREATE INDEX outreach_activities_created_at_idx ON public.outreach_activities USING btree (created_at);

CREATE INDEX outreach_activities_lead_id_created_at_idx ON public.outreach_activities USING btree (lead_id, created_at);

CREATE INDEX outreach_activities_partner_id_kind_created_at_idx ON public.outreach_activities USING btree (partner_id, kind, created_at);

CREATE INDEX outreach_leads_converted_user_id_idx ON public.outreach_leads USING btree (converted_user_id);

CREATE INDEX outreach_leads_do_not_contact_at_idx ON public.outreach_leads USING btree (do_not_contact_at);

CREATE UNIQUE INDEX outreach_leads_email_key ON public.outreach_leads USING btree (email);

CREATE INDEX outreach_leads_next_action_at_idx ON public.outreach_leads USING btree (next_action_at);

CREATE INDEX outreach_leads_partner_id_status_created_at_idx ON public.outreach_leads USING btree (partner_id, status, created_at);

CREATE UNIQUE INDEX outreach_leads_phone_key ON public.outreach_leads USING btree (phone);

CREATE INDEX outreach_leads_state_code_kind_idx ON public.outreach_leads USING btree (state_code, kind);

CREATE INDEX outreach_leads_status_created_at_idx ON public.outreach_leads USING btree (status, created_at);

CREATE UNIQUE INDEX outreach_leads_unsubscribe_token_key ON public.outreach_leads USING btree (unsubscribe_token);

CREATE UNIQUE INDEX outreach_suppressions_kind_value_key ON public.outreach_suppressions USING btree (kind, value);

CREATE INDEX outreach_templates_active_kind_idx ON public.outreach_templates USING btree (active, kind);

CREATE UNIQUE INDEX partner_commissions_event_ref_key ON public.partner_commissions USING btree (event_ref);

CREATE INDEX partner_commissions_partner_id_created_at_idx ON public.partner_commissions USING btree (partner_id, created_at DESC);

CREATE INDEX partner_commissions_period_status_idx ON public.partner_commissions USING btree (period, status);

CREATE INDEX partner_commissions_referred_user_id_idx ON public.partner_commissions USING btree (referred_user_id);

CREATE INDEX partner_commissions_status_hold_until_idx ON public.partner_commissions USING btree (status, hold_until);

CREATE INDEX partners_status_created_at_idx ON public.partners USING btree (status, created_at);

CREATE UNIQUE INDEX partners_user_id_key ON public.partners USING btree (user_id);

CREATE INDEX payment_requests_attorney_id_created_at_idx ON public.payment_requests USING btree (attorney_id, created_at DESC);

CREATE INDEX payment_requests_case_id_created_at_idx ON public.payment_requests USING btree (case_id, created_at DESC);

CREATE INDEX payment_requests_client_id_status_due_at_idx ON public.payment_requests USING btree (client_id, status, due_at);

CREATE UNIQUE INDEX payment_requests_payment_id_key ON public.payment_requests USING btree (payment_id);

CREATE INDEX payment_requests_status_due_at_idx ON public.payment_requests USING btree (status, due_at);

CREATE UNIQUE INDEX payments_stripe_invoice_id_key ON public.payments USING btree (stripe_invoice_id);

CREATE INDEX payments_user_id_created_at_idx ON public.payments USING btree (user_id, created_at DESC);

CREATE INDEX payout_accounts_status_idx ON public.payout_accounts USING btree (status);

CREATE UNIQUE INDEX payout_accounts_stripe_account_id_key ON public.payout_accounts USING btree (stripe_account_id);

CREATE INDEX payroll_accruals_employee_id_status_idx ON public.payroll_accruals USING btree (employee_id, status);

CREATE UNIQUE INDEX payroll_accruals_event_ref_key ON public.payroll_accruals USING btree (event_ref);

CREATE INDEX payroll_accruals_payout_id_idx ON public.payroll_accruals USING btree (payout_id);

CREATE INDEX payroll_employees_active_name_idx ON public.payroll_employees USING btree (active, name);

CREATE UNIQUE INDEX payroll_employees_user_id_key ON public.payroll_employees USING btree (user_id);

CREATE INDEX payroll_payouts_batch_id_idx ON public.payroll_payouts USING btree (batch_id);

CREATE INDEX payroll_payouts_employee_id_created_at_idx ON public.payroll_payouts USING btree (employee_id, created_at DESC);

CREATE INDEX payroll_payouts_period_created_at_idx ON public.payroll_payouts USING btree (period, created_at DESC);

CREATE INDEX plan_prices_kind_idx ON public.plan_prices USING btree (kind, active, created_at DESC);

CREATE INDEX plans_audience_idx ON public.plans USING btree (audience, status, sort);

CREATE UNIQUE INDEX plans_code_key ON public.plans USING btree (code);

CREATE UNIQUE INDEX post_attachments_file_id_key ON public.post_attachments USING btree (file_id);

CREATE UNIQUE INDEX post_attachments_post_id_position_key ON public.post_attachments USING btree (post_id, "position");

CREATE INDEX post_likes_user_id_created_at_idx ON public.post_likes USING btree (user_id, created_at DESC);

CREATE INDEX post_media_file_id_idx ON public.post_media USING btree (file_id);

CREATE UNIQUE INDEX post_media_post_id_position_key ON public.post_media USING btree (post_id, "position");

CREATE INDEX post_reposts_post_id_idx ON public.post_reposts USING btree (post_id);

CREATE INDEX post_reposts_user_id_created_at_idx ON public.post_reposts USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX post_reposts_user_id_post_id_key ON public.post_reposts USING btree (user_id, post_id);

CREATE INDEX post_shares_post_id_idx ON public.post_shares USING btree (post_id);

CREATE INDEX post_tags_tag_id_post_id_idx ON public.post_tags USING btree (tag_id, post_id);

CREATE INDEX post_views_post_id_idx ON public.post_views USING btree (post_id);

CREATE UNIQUE INDEX post_views_user_id_post_id_key ON public.post_views USING btree (user_id, post_id);

CREATE INDEX posts_author_published_idx ON public.posts USING btree (author_id, created_at DESC) WHERE ((status = 'published'::public.content_status) AND (deleted_at IS NULL));

CREATE INDEX posts_content_class_created_at_idx ON public.posts USING btree (content_class, created_at DESC);

CREATE INDEX posts_global_feed_idx ON public.posts USING btree (created_shard, created_at DESC) WHERE (status = 'published'::public.content_status);

CREATE INDEX posts_kind_created_at_idx ON public.posts USING btree (kind, created_at DESC);

CREATE UNIQUE INDEX posts_pin_slot_key ON public.posts USING btree (author_id, pin_group, pin_slot) WHERE (pin_slot IS NOT NULL);

CREATE INDEX posts_practice_area_id_created_at_idx ON public.posts USING btree (practice_area_id, created_at DESC);

CREATE INDEX posts_search_tsv_idx ON public.posts USING gin (search_tsv);

CREATE INDEX posts_search_tsv_simple_idx ON public.posts USING gin (search_tsv_simple);

CREATE UNIQUE INDEX posts_video_asset_id_key ON public.posts USING btree (video_asset_id);

CREATE UNIQUE INDEX practice_areas_code_key ON public.practice_areas USING btree (code);

CREATE INDEX practice_areas_parent_id_idx ON public.practice_areas USING btree (parent_id);

CREATE INDEX promo_codes_active_expires_at_idx ON public.promo_codes USING btree (active, expires_at);

CREATE UNIQUE INDEX promo_codes_code_key ON public.promo_codes USING btree (code);

CREATE UNIQUE INDEX promo_redemptions_promo_id_user_id_key ON public.promo_redemptions USING btree (promo_id, user_id);

CREATE INDEX promo_redemptions_user_id_idx ON public.promo_redemptions USING btree (user_id);

CREATE INDEX promotion_views_user_id_last_seen_at_idx ON public.promotion_views USING btree (user_id, last_seen_at DESC);

CREATE UNIQUE INDEX push_tokens_fcm_token_key ON public.push_tokens USING btree (fcm_token);

CREATE INDEX push_tokens_user_id_idx ON public.push_tokens USING btree (user_id);

CREATE UNIQUE INDEX referral_codes_code_key ON public.referral_codes USING btree (code);

CREATE UNIQUE INDEX referral_codes_user_id_key ON public.referral_codes USING btree (user_id);

CREATE UNIQUE INDEX referrals_referee_id_key ON public.referrals USING btree (referee_id);

CREATE INDEX referrals_referrer_id_created_at_idx ON public.referrals USING btree (referrer_id, created_at DESC);

CREATE INDEX referrals_status_created_at_idx ON public.referrals USING btree (status, created_at);

CREATE INDEX refunds_created_at_idx ON public.refunds USING btree (created_at DESC);

CREATE INDEX refunds_payment_id_idx ON public.refunds USING btree (payment_id);

CREATE UNIQUE INDEX refunds_stripe_refund_id_key ON public.refunds USING btree (stripe_refund_id);

CREATE INDEX reports_reporter_id_idx ON public.reports USING btree (reporter_id);

CREATE INDEX reports_status_created_at_idx ON public.reports USING btree (status, created_at);

CREATE INDEX reports_target_type_target_id_status_idx ON public.reports USING btree (target_type, target_id, status);

CREATE INDEX reviews_attorney_id_created_at_idx ON public.reviews USING btree (attorney_id, created_at DESC);

CREATE INDEX reviews_attorney_rating_created_idx ON public.reviews USING btree (attorney_id, rating, created_at DESC) WHERE (status = 'published'::public.review_status);

CREATE UNIQUE INDEX reviews_case_id_key ON public.reviews USING btree (case_id);

CREATE UNIQUE INDEX reviews_open_author_uq ON public.reviews USING btree (client_id, attorney_id) WHERE ((case_id IS NULL) AND (status <> 'removed'::public.review_status));

CREATE INDEX reviews_photo_ids_idx ON public.reviews USING gin (photo_ids);

CREATE INDEX saved_items_user_id_item_type_created_at_idx ON public.saved_items USING btree (user_id, item_type, created_at DESC);

CREATE INDEX seat_limit_requests_attorney_created_idx ON public.seat_limit_requests USING btree (attorney_id, created_at);

CREATE INDEX seat_limit_requests_status_created_idx ON public.seat_limit_requests USING btree (status, created_at);

CREATE INDEX sessions_active_user_idx ON public.sessions USING btree (user_id) WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX sessions_refresh_hash_key ON public.sessions USING btree (refresh_hash);

CREATE INDEX sessions_session_chain_id_idx ON public.sessions USING btree (session_chain_id);

CREATE INDEX sessions_user_id_device_id_idx ON public.sessions USING btree (user_id, device_id);

CREATE INDEX staff_rewards_admin_id_created_at_idx ON public.staff_rewards USING btree (admin_id, created_at DESC);

CREATE UNIQUE INDEX staff_rewards_period_department_admin_id_key ON public.staff_rewards USING btree (period, department, admin_id);

CREATE INDEX states_country_code_idx ON public.states USING btree (country_code);

CREATE INDEX sticker_packs_official_idx ON public.sticker_packs USING btree (is_official, status, install_count DESC);

CREATE INDEX sticker_packs_owner_idx ON public.sticker_packs USING btree (owner_user_id, created_at DESC);

CREATE UNIQUE INDEX sticker_packs_short_name_key ON public.sticker_packs USING btree (short_name);

CREATE UNIQUE INDEX stickers_file_id_key ON public.stickers USING btree (file_id);

CREATE INDEX stickers_pack_position_idx ON public.stickers USING btree (pack_id, "position");

CREATE UNIQUE INDEX storage_snapshots_day_key ON public.storage_snapshots USING btree (day);

CREATE UNIQUE INDEX stripe_customers_stripe_customer_id_key ON public.stripe_customers USING btree (stripe_customer_id);

CREATE INDEX subscriptions_current_period_end_idx ON public.subscriptions USING btree (current_period_end);

CREATE INDEX subscriptions_status_trial_ends_at_idx ON public.subscriptions USING btree (status, trial_ends_at);

CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_key ON public.subscriptions USING btree (stripe_subscription_id);

CREATE UNIQUE INDEX subscriptions_user_id_key ON public.subscriptions USING btree (user_id);

CREATE INDEX support_macros_active_title_idx ON public.support_macros USING btree (active, title);

CREATE INDEX support_messages_ticket_id_created_at_idx ON public.support_messages USING btree (ticket_id, created_at);

CREATE INDEX support_tickets_assignee_id_status_idx ON public.support_tickets USING btree (assignee_id, status);

CREATE INDEX support_tickets_country_code_status_idx ON public.support_tickets USING btree (country_code, status);

CREATE INDEX support_tickets_sla_due_at_idx ON public.support_tickets USING btree (sla_due_at);

CREATE INDEX support_tickets_status_last_message_at_idx ON public.support_tickets USING btree (status, last_message_at DESC);

CREATE INDEX support_tickets_user_id_last_message_at_idx ON public.support_tickets USING btree (user_id, last_message_at DESC);

CREATE UNIQUE INDEX tags_tag_lower_key ON public.tags USING btree (tag_lower);

CREATE INDEX tags_tag_trgm_idx ON public.tags USING gin (tag_lower public.gin_trgm_ops) WHERE (tag_lower IS NOT NULL);

CREATE INDEX treasury_expenses_active_sort_idx ON public.treasury_expenses USING btree (active, sort);

CREATE INDEX treasury_payouts_created_at_idx ON public.treasury_payouts USING btree (created_at DESC);

CREATE UNIQUE INDEX treasury_payouts_key_key ON public.treasury_payouts USING btree (key);

CREATE INDEX treasury_payouts_period_kind_idx ON public.treasury_payouts USING btree (period, kind);

CREATE INDEX treasury_payouts_status_idx ON public.treasury_payouts USING btree (status);

CREATE INDEX user_blocks_blocked_id_idx ON public.user_blocks USING btree (blocked_id);

CREATE INDEX user_consents_user_id_consent_type_created_at_idx ON public.user_consents USING btree (user_id, consent_type, created_at DESC);

CREATE UNIQUE INDEX user_identifiers_provider_provider_uid_key ON public.user_identifiers USING btree (provider, provider_uid);

CREATE INDEX user_identifiers_user_id_idx ON public.user_identifiers USING btree (user_id);

CREATE INDEX user_recent_stickers_used_idx ON public.user_recent_stickers USING btree (user_id, used_at DESC);

CREATE INDEX user_sticker_packs_pack_idx ON public.user_sticker_packs USING btree (pack_id);

CREATE INDEX users_avatar_file_id_idx ON public.users USING btree (avatar_file_id);

CREATE INDEX users_country_code_idx ON public.users USING btree (country_code);

CREATE INDEX users_created_at_idx ON public.users USING btree (created_at);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE INDEX users_full_name_trgm_idx ON public.users USING gin (full_name_lower public.gin_trgm_ops) WHERE (full_name_lower IS NOT NULL);

CREATE UNIQUE INDEX users_phone_e164_key ON public.users USING btree (phone_e164);

CREATE INDEX users_phone_sha256_idx ON public.users USING btree (phone_sha256) WHERE (phone_sha256 IS NOT NULL);

CREATE INDEX users_status_deletion_requested_at_idx ON public.users USING btree (status, deletion_requested_at);

CREATE INDEX verification_checks_request_id_idx ON public.verification_checks USING btree (request_id);

CREATE INDEX verification_documents_request_id_idx ON public.verification_documents USING btree (request_id);

CREATE INDEX verification_requests_attorney_id_idx ON public.verification_requests USING btree (attorney_id);

CREATE INDEX verification_requests_status_submitted_at_idx ON public.verification_requests USING btree (status, submitted_at);

CREATE UNIQUE INDEX video_assets_external_id_key ON public.video_assets USING btree (external_id);

CREATE INDEX video_assets_owner_created_idx ON public.video_assets USING btree (owner_user_id, created_at DESC);

CREATE INDEX video_assets_status_created_idx ON public.video_assets USING btree (status, created_at);

ALTER TABLE ONLY public.admin_credentials
    ADD CONSTRAINT admin_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.admin_profiles
    ADD CONSTRAINT admin_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.assistant_activity
    ADD CONSTRAINT assistant_activity_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.assistant_memberships(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_liability_acceptances
    ADD CONSTRAINT assistant_liability_acceptances_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_liability_acceptances
    ADD CONSTRAINT assistant_liability_acceptances_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.assistant_memberships(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_memberships
    ADD CONSTRAINT assistant_memberships_assistant_user_id_fkey FOREIGN KEY (assistant_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.assistant_memberships
    ADD CONSTRAINT assistant_memberships_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.assistant_requests
    ADD CONSTRAINT assistant_requests_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.assistant_memberships(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.attorney_licenses
    ADD CONSTRAINT attorney_licenses_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.attorney_profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.attorney_licenses
    ADD CONSTRAINT attorney_licenses_state_code_fkey FOREIGN KEY (state_code) REFERENCES public.states(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.attorney_licenses
    ADD CONSTRAINT attorney_licenses_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.attorney_practice_areas
    ADD CONSTRAINT attorney_practice_areas_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.attorney_profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.attorney_practice_areas
    ADD CONSTRAINT attorney_practice_areas_practice_area_id_fkey FOREIGN KEY (practice_area_id) REFERENCES public.practice_areas(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.attorney_profiles
    ADD CONSTRAINT attorney_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.attorney_task_people
    ADD CONSTRAINT attorney_task_people_task_fkey FOREIGN KEY (task_id) REFERENCES public.attorney_tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attorney_task_people
    ADD CONSTRAINT attorney_task_people_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.attorney_task_places
    ADD CONSTRAINT attorney_task_places_task_fkey FOREIGN KEY (task_id) REFERENCES public.attorney_tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attorney_task_steps
    ADD CONSTRAINT attorney_task_steps_task_fkey FOREIGN KEY (task_id) REFERENCES public.attorney_tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attorney_tasks
    ADD CONSTRAINT attorney_tasks_assignee_fkey FOREIGN KEY (assignee_membership_id) REFERENCES public.assistant_memberships(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.attorney_tasks
    ADD CONSTRAINT attorney_tasks_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.attorney_tasks
    ADD CONSTRAINT attorney_tasks_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.attorney_tasks
    ADD CONSTRAINT attorney_tasks_membership_fkey FOREIGN KEY (created_by_membership_id) REFERENCES public.assistant_memberships(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.attorney_trust
    ADD CONSTRAINT attorney_trust_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.attorney_profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.attorney_trust_events
    ADD CONSTRAINT attorney_trust_events_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.attorney_profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.bar_number_block_events
    ADD CONSTRAINT bar_number_block_events_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.bar_number_blocks(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.bid_drafts
    ADD CONSTRAINT bid_drafts_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bid_drafts
    ADD CONSTRAINT bid_drafts_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bid_offers
    ADD CONSTRAINT bid_offers_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_comment_likes
    ADD CONSTRAINT case_comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.case_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_comment_likes
    ADD CONSTRAINT case_comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_comments
    ADD CONSTRAINT case_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_comments
    ADD CONSTRAINT case_comments_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_comments
    ADD CONSTRAINT case_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.case_comments(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_disputes
    ADD CONSTRAINT case_disputes_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_disputes
    ADD CONSTRAINT case_disputes_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_disputes
    ADD CONSTRAINT case_disputes_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_invites
    ADD CONSTRAINT case_invites_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_invites
    ADD CONSTRAINT case_invites_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_invites
    ADD CONSTRAINT case_invites_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_journal
    ADD CONSTRAINT case_journal_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_journal
    ADD CONSTRAINT case_journal_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_journal
    ADD CONSTRAINT case_journal_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_journal
    ADD CONSTRAINT case_journal_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_photos
    ADD CONSTRAINT case_photos_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_photos
    ADD CONSTRAINT case_photos_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_shares
    ADD CONSTRAINT case_shares_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_shares
    ADD CONSTRAINT case_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.case_states
    ADD CONSTRAINT case_states_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_states
    ADD CONSTRAINT case_states_state_code_fkey FOREIGN KEY (state_code) REFERENCES public.states(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.case_task_events
    ADD CONSTRAINT case_task_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.case_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.case_task_items
    ADD CONSTRAINT case_task_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.case_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.case_tasks
    ADD CONSTRAINT case_tasks_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.case_updates
    ADD CONSTRAINT case_updates_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_accepted_bid_id_fkey FOREIGN KEY (accepted_bid_id) REFERENCES public.bids(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_practice_area_id_fkey FOREIGN KEY (practice_area_id) REFERENCES public.practice_areas(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_primary_state_code_fkey FOREIGN KEY (primary_state_code) REFERENCES public.states(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_profiles
    ADD CONSTRAINT client_profiles_state_code_fkey FOREIGN KEY (state_code) REFERENCES public.states(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_profiles
    ADD CONSTRAINT client_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_review_appeals
    ADD CONSTRAINT client_review_appeals_appellant_id_fkey FOREIGN KEY (appellant_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.client_review_appeals
    ADD CONSTRAINT client_review_appeals_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.client_reviews(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.client_review_helpful_votes
    ADD CONSTRAINT client_review_helpful_votes_review_fkey FOREIGN KEY (review_id) REFERENCES public.client_reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_review_helpful_votes
    ADD CONSTRAINT client_review_helpful_votes_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_reviews
    ADD CONSTRAINT client_reviews_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_reviews
    ADD CONSTRAINT client_reviews_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_reviews
    ADD CONSTRAINT client_reviews_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_subscriptions
    ADD CONSTRAINT client_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.client_subscriptions
    ADD CONSTRAINT client_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.client_verifications
    ADD CONSTRAINT client_verifications_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.comments(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_disclosures
    ADD CONSTRAINT contact_disclosures_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_disclosures
    ADD CONSTRAINT contact_disclosures_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_disclosures
    ADD CONSTRAINT contact_disclosures_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_disclosures
    ADD CONSTRAINT contact_disclosures_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_issue_reports
    ADD CONSTRAINT contact_issue_reports_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_issue_reports
    ADD CONSTRAINT contact_issue_reports_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_issue_reports
    ADD CONSTRAINT contact_issue_reports_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_issue_reports
    ADD CONSTRAINT contact_issue_reports_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_issue_reports
    ADD CONSTRAINT contact_issue_reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.contact_matches
    ADD CONSTRAINT contact_matches_matched_fkey FOREIGN KEY (matched_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_matches
    ADD CONSTRAINT contact_matches_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_sync_settings
    ADD CONSTRAINT contact_sync_settings_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.country_partner_settlements
    ADD CONSTRAINT country_partner_settlements_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.country_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.country_waitlist
    ADD CONSTRAINT country_waitlist_country_code_fkey FOREIGN KEY (country_code) REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.data_access_log
    ADD CONSTRAINT data_access_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.data_access_log
    ADD CONSTRAINT data_access_log_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.data_access_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.data_access_requests
    ADD CONSTRAINT data_access_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.data_export_jobs
    ADD CONSTRAINT data_export_jobs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.data_export_jobs
    ADD CONSTRAINT data_export_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.dmca_notices
    ADD CONSTRAINT dmca_notices_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.dmca_notices
    ADD CONSTRAINT dmca_notices_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_practice_area_id_fkey FOREIGN KEY (practice_area_id) REFERENCES public.practice_areas(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_followee_id_fkey FOREIGN KEY (followee_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.i18n_bundle_versions
    ADD CONSTRAINT i18n_bundle_versions_lang_fkey FOREIGN KEY (lang) REFERENCES public.i18n_languages(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.i18n_translations
    ADD CONSTRAINT i18n_translations_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.i18n_keys(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.i18n_translations
    ADD CONSTRAINT i18n_translations_lang_fkey FOREIGN KEY (lang) REFERENCES public.i18n_languages(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.integration_credentials
    ADD CONSTRAINT integration_credentials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sticker_fkey FOREIGN KEY (sticker_id) REFERENCES public.stickers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.new_case_alert_practices
    ADD CONSTRAINT new_case_alert_practices_area_fkey FOREIGN KEY (practice_area_id) REFERENCES public.practice_areas(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.new_case_alert_practices
    ADD CONSTRAINT new_case_alert_practices_attorney_fkey FOREIGN KEY (attorney_id) REFERENCES public.attorney_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notification_quiet_hours
    ADD CONSTRAINT notification_quiet_hours_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.onboarding_state
    ADD CONSTRAINT onboarding_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.outreach_activities
    ADD CONSTRAINT outreach_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.outreach_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.outreach_leads
    ADD CONSTRAINT outreach_leads_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.partner_commissions
    ADD CONSTRAINT partner_commissions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.payroll_accruals
    ADD CONSTRAINT payroll_accruals_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.payroll_employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.payroll_payouts
    ADD CONSTRAINT payroll_payouts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.payroll_employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.post_attachments
    ADD CONSTRAINT post_attachments_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.post_attachments
    ADD CONSTRAINT post_attachments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.post_media
    ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_reposts
    ADD CONSTRAINT post_reposts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_reposts
    ADD CONSTRAINT post_reposts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_shares
    ADD CONSTRAINT post_shares_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_shares
    ADD CONSTRAINT post_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_tags
    ADD CONSTRAINT post_tags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_tags
    ADD CONSTRAINT post_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_practice_area_id_fkey FOREIGN KEY (practice_area_id) REFERENCES public.practice_areas(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_video_asset_fkey FOREIGN KEY (video_asset_id) REFERENCES public.video_assets(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.practice_areas
    ADD CONSTRAINT practice_areas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.practice_areas(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_views
    ADD CONSTRAINT promotion_views_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.case_promotions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.review_helpful_votes
    ADD CONSTRAINT review_helpful_votes_review_fkey FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_helpful_votes
    ADD CONSTRAINT review_helpful_votes_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.saved_items
    ADD CONSTRAINT saved_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.state_bar_registries
    ADD CONSTRAINT state_bar_registries_state_code_fkey FOREIGN KEY (state_code) REFERENCES public.states(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_country_code_fkey FOREIGN KEY (country_code) REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.sticker_packs
    ADD CONSTRAINT sticker_packs_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stickers
    ADD CONSTRAINT stickers_file_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stickers
    ADD CONSTRAINT stickers_pack_fkey FOREIGN KEY (pack_id) REFERENCES public.sticker_packs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stripe_customers
    ADD CONSTRAINT stripe_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.legal_documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.user_identifiers
    ADD CONSTRAINT user_identifiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.user_recent_stickers
    ADD CONSTRAINT user_recent_stickers_sticker_fkey FOREIGN KEY (sticker_id) REFERENCES public.stickers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_recent_stickers
    ADD CONSTRAINT user_recent_stickers_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_sticker_packs
    ADD CONSTRAINT user_sticker_packs_pack_fkey FOREIGN KEY (pack_id) REFERENCES public.sticker_packs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_sticker_packs
    ADD CONSTRAINT user_sticker_packs_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_avatar_file_id_fkey FOREIGN KEY (avatar_file_id) REFERENCES public.files(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_country_code_fkey FOREIGN KEY (country_code) REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.verification_checks
    ADD CONSTRAINT verification_checks_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.verification_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.verification_documents
    ADD CONSTRAINT verification_documents_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.verification_documents
    ADD CONSTRAINT verification_documents_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.verification_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.verification_documents
    ADD CONSTRAINT verification_documents_state_code_fkey FOREIGN KEY (state_code) REFERENCES public.states(code) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_attorney_id_fkey FOREIGN KEY (attorney_id) REFERENCES public.attorney_profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Database roles of docs/02 §6.2/6.3 (the final state of the old role
-- migrations). A managed service whose migration user may not create roles
-- (scripts/deploy/prod-db-setup.sh makes them by hand) only gets a notice.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['lawbid_migrator', 'lawbid_app', 'lawbid_retention', 'lawbid_readonly'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN', r);
    END IF;
  END LOOP;

  GRANT ALL ON ALL TABLES IN SCHEMA public TO lawbid_migrator;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lawbid_app;
  REVOKE UPDATE, DELETE ON TABLE case_journal, contact_disclosures, audit_log,
    data_access_log, auth_events, user_consents FROM lawbid_app;
  REVOKE ALL ON TABLE _prisma_migrations FROM lawbid_app;
  GRANT SELECT, DELETE ON TABLE case_journal, auth_events TO lawbid_retention;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO lawbid_readonly;
  REVOKE SELECT ON TABLE users, user_identifiers, sessions, auth_events, files,
    verification_documents, contact_disclosures, contact_issue_reports, messages,
    client_profiles, push_tokens, data_access_requests, data_access_log,
    _prisma_migrations FROM lawbid_readonly;
  GRANT SELECT ON TABLE admin_credentials, data_export_jobs TO lawbid_readonly;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lawbid_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO lawbid_migrator;
  GRANT USAGE ON SCHEMA public TO lawbid_app, lawbid_retention, lawbid_readonly, lawbid_migrator;
  -- Limits on the database side (infra/postgres/role-settings.sql): one
  -- runaway query or forgotten transaction cannot hold the database.
  ALTER ROLE lawbid_app SET statement_timeout = '30s';
  ALTER ROLE lawbid_app SET idle_in_transaction_session_timeout = '60s';
  ALTER ROLE lawbid_app SET lock_timeout = '10s';
  ALTER ROLE lawbid_retention SET statement_timeout = '10min';
  ALTER ROLE lawbid_retention SET idle_in_transaction_session_timeout = '5min';
  ALTER ROLE lawbid_readonly SET statement_timeout = '2min';
  ALTER ROLE lawbid_readonly SET default_transaction_read_only = 'on';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'database roles not set up here (insufficient privilege)';
END
$$;

-- Reference rows
INSERT INTO "app_config" ("key", "value", "updated_at")
VALUES ('contacts.suspend_after_confirmed_reports', '3'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('rate_limit.post_create_per_day', '10'::JSONB, now()),
  ('rate_limit.comment_per_hour', '30'::JSONB, now()),
  ('rate_limit.like_per_hour', '300'::JSONB, now()),
  ('rate_limit.follow_per_day', '200'::JSONB, now()),
  ('rate_limit.message_per_minute', '60'::JSONB, now()),
  ('rate_limit.search_per_minute', '30'::JSONB, now()),
  ('rate_limit.report_per_day', '20'::JSONB, now()),
  ('notifications.retention_days', '180'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('chat_translate', false, 100, 'Translate button under chat messages (Google Translate)', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('video_calls', false, 100, 'Video calls in chats (WebRTC, needs TURN in Admin → Integrations)', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('document_templates', true, 100, 'Document templates library (Content → Document templates; app → Templates)', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('web_client', true, 100, 'Sign-in from the web client (platform = web)', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('payments_in_app', false, 100, 'Clients pay the accepted attorney through the platform (Stripe Connect)', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, updated_at) VALUES
  ('payroll.stripe_fee_percent', '0.25'::JSONB, now()),
  ('payroll.stripe_fee_fixed_cents', '25'::JSONB, now()),
  ('payroll.stripe_monthly_fee_cents', '200'::JSONB, now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('payroll_stripe_payouts', false, 100, 'Salaries paid out through Stripe Connect (employees link a bank account or card)', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('translate.scope', '"all"'::JSONB, now()),
  ('translate.chat', 'true'::JSONB, now()),
  ('translate.posts', 'true'::JSONB, now()),
  ('translate.cases', 'true'::JSONB, now()),
  ('translate.reviews', 'true'::JSONB, now()),
  ('translate.profiles', 'true'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('support.auto_assign', 'true'::JSONB, now()),
  ('support.sla_first_response_minutes', '60'::JSONB, now()),
  ('support.sla_urgent_minutes', '15'::JSONB, now()),
  ('support.sla_alerts', 'true'::JSONB, now()),
  ('support.escalate_on_breach', 'true'::JSONB, now()),
  ('support.always_open', 'true'::JSONB, now()),
  ('support.open_days', '[1,2,3,4,5]'::JSONB, now()),
  ('support.open_from_hour', '9'::JSONB, now()),
  ('support.open_to_hour', '18'::JSONB, now()),
  ('support.timezone', '"America/Chicago"'::JSONB, now()),
  ('support.auto_reply', 'true'::JSONB, now()),
  ('support.auto_close_resolved_days', '7'::JSONB, now()),
  ('rewards.enabled', 'false'::JSONB, now()),
  ('rewards.auto_award', 'true'::JSONB, now()),
  ('rewards.period', '"month"'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "countries" ("code", "name", "is_enabled", "calling_code", "currency", "language", "region_kind", "timezone", "stripe_supported", "sort") VALUES
  ('US', 'United States', true, '1', 'USD', 'en', 'state', 'America/New_York', true, 1),
  ('CA', 'Canada', false, '1', 'CAD', 'en', 'province', 'America/Toronto', true, 2),
  ('MX', 'Mexico', false, '52', 'MXN', 'es', 'state', 'America/Mexico_City', true, 3),
  ('AF', 'Afghanistan', false, '93', 'AFN', 'fa', 'region', NULL, false, 4),
  ('AX', 'Åland Islands', false, '358', 'EUR', 'en', 'region', NULL, false, 5),
  ('AL', 'Albania', false, '355', 'ALL', 'en', 'region', NULL, false, 6),
  ('DZ', 'Algeria', false, '213', 'DZD', 'ar', 'region', NULL, false, 7),
  ('AS', 'American Samoa', false, '1', 'USD', 'en', 'region', NULL, false, 8),
  ('AD', 'Andorra', false, '376', 'EUR', 'en', 'region', NULL, false, 9),
  ('AO', 'Angola', false, '244', 'AOA', 'en', 'region', NULL, false, 10),
  ('AI', 'Anguilla', false, '1', 'XCD', 'en', 'region', NULL, false, 11),
  ('AG', 'Antigua & Barbuda', false, '1', 'XCD', 'en', 'region', NULL, false, 12),
  ('AR', 'Argentina', false, '54', 'ARS', 'es', 'region', NULL, false, 13),
  ('AM', 'Armenia', false, '374', 'AMD', 'hy', 'region', NULL, false, 14),
  ('AW', 'Aruba', false, '297', 'AWG', 'en', 'region', NULL, false, 15),
  ('AU', 'Australia', false, '61', 'AUD', 'en', 'region', NULL, true, 16),
  ('AT', 'Austria', false, '43', 'EUR', 'de', 'region', NULL, true, 17),
  ('AZ', 'Azerbaijan', false, '994', 'AZN', 'az', 'region', NULL, false, 18),
  ('BS', 'Bahamas', false, '1', 'BSD', 'en', 'region', NULL, false, 19),
  ('BH', 'Bahrain', false, '973', 'BHD', 'ar', 'region', NULL, false, 20),
  ('BD', 'Bangladesh', false, '880', 'BDT', 'bn', 'region', NULL, false, 21),
  ('BB', 'Barbados', false, '1', 'BBD', 'en', 'region', NULL, false, 22),
  ('BY', 'Belarus', false, '375', 'BYN', 'ru', 'region', NULL, false, 23),
  ('BE', 'Belgium', false, '32', 'EUR', 'fr', 'region', NULL, true, 24),
  ('BZ', 'Belize', false, '501', 'BZD', 'en', 'region', NULL, false, 25),
  ('BJ', 'Benin', false, '229', 'XOF', 'en', 'region', NULL, false, 26),
  ('BM', 'Bermuda', false, '1', 'BMD', 'en', 'region', NULL, false, 27),
  ('BT', 'Bhutan', false, '975', 'BTN', 'en', 'region', NULL, false, 28),
  ('BO', 'Bolivia', false, '591', 'BOB', 'es', 'region', NULL, false, 29),
  ('BA', 'Bosnia & Herzegovina', false, '387', 'BAM', 'en', 'region', NULL, false, 30),
  ('BW', 'Botswana', false, '267', 'BWP', 'en', 'region', NULL, false, 31),
  ('BR', 'Brazil', false, '55', 'BRL', 'pt', 'region', NULL, true, 32),
  ('IO', 'British Indian Ocean Territory', false, '246', 'USD', 'en', 'region', NULL, false, 33),
  ('VG', 'British Virgin Islands', false, '1', 'USD', 'en', 'region', NULL, false, 34),
  ('BN', 'Brunei', false, '673', 'BND', 'en', 'region', NULL, false, 35),
  ('BG', 'Bulgaria', false, '359', 'BGN', 'bg', 'region', NULL, true, 36),
  ('BF', 'Burkina Faso', false, '226', 'XOF', 'en', 'region', NULL, false, 37),
  ('BI', 'Burundi', false, '257', 'BIF', 'en', 'region', NULL, false, 38),
  ('KH', 'Cambodia', false, '855', 'KHR', 'en', 'region', NULL, false, 39),
  ('CM', 'Cameroon', false, '237', 'XAF', 'en', 'region', NULL, false, 40),
  ('CV', 'Cape Verde', false, '238', 'CVE', 'en', 'region', NULL, false, 41),
  ('BQ', 'Caribbean Netherlands', false, '599', 'USD', 'en', 'region', NULL, false, 42),
  ('KY', 'Cayman Islands', false, '1', 'KYD', 'en', 'region', NULL, false, 43),
  ('CF', 'Central African Republic', false, '236', 'XAF', 'en', 'region', NULL, false, 44),
  ('TD', 'Chad', false, '235', 'XAF', 'en', 'region', NULL, false, 45),
  ('CL', 'Chile', false, '56', 'CLP', 'es', 'region', NULL, false, 46),
  ('CN', 'China', false, '86', 'CNY', 'zh', 'region', NULL, false, 47),
  ('CX', 'Christmas Island', false, '61', 'AUD', 'en', 'region', NULL, false, 48),
  ('CC', 'Cocos (Keeling) Islands', false, '61', 'AUD', 'en', 'region', NULL, false, 49),
  ('CO', 'Colombia', false, '57', 'COP', 'es', 'region', NULL, false, 50),
  ('KM', 'Comoros', false, '269', 'KMF', 'en', 'region', NULL, false, 51),
  ('CG', 'Congo - Brazzaville', false, '242', 'XAF', 'en', 'region', NULL, false, 52),
  ('CD', 'Congo - Kinshasa', false, '243', 'CDF', 'en', 'region', NULL, false, 53),
  ('CK', 'Cook Islands', false, '682', 'NZD', 'en', 'region', NULL, false, 54),
  ('CR', 'Costa Rica', false, '506', 'CRC', 'es', 'region', NULL, false, 55),
  ('CI', 'Côte d’Ivoire', false, '225', 'XOF', 'en', 'region', NULL, false, 56),
  ('HR', 'Croatia', false, '385', 'EUR', 'hr', 'region', NULL, true, 57),
  ('CU', 'Cuba', false, '53', 'CUP', 'es', 'region', NULL, false, 58),
  ('CW', 'Curaçao', false, '599', 'XCG', 'en', 'region', NULL, false, 59),
  ('CY', 'Cyprus', false, '357', 'EUR', 'en', 'region', NULL, true, 60),
  ('CZ', 'Czechia', false, '420', 'CZK', 'cs', 'region', NULL, true, 61),
  ('DK', 'Denmark', false, '45', 'DKK', 'da', 'region', NULL, true, 62),
  ('DJ', 'Djibouti', false, '253', 'DJF', 'en', 'region', NULL, false, 63),
  ('DM', 'Dominica', false, '1', 'XCD', 'en', 'region', NULL, false, 64),
  ('DO', 'Dominican Republic', false, '1', 'DOP', 'es', 'region', NULL, false, 65),
  ('EC', 'Ecuador', false, '593', 'USD', 'es', 'region', NULL, false, 66),
  ('EG', 'Egypt', false, '20', 'EGP', 'ar', 'region', NULL, false, 67),
  ('SV', 'El Salvador', false, '503', 'USD', 'es', 'region', NULL, false, 68),
  ('GQ', 'Equatorial Guinea', false, '240', 'XAF', 'en', 'region', NULL, false, 69),
  ('ER', 'Eritrea', false, '291', 'ERN', 'en', 'region', NULL, false, 70),
  ('EE', 'Estonia', false, '372', 'EUR', 'et', 'region', NULL, true, 71),
  ('SZ', 'Eswatini', false, '268', 'SZL', 'en', 'region', NULL, false, 72),
  ('ET', 'Ethiopia', false, '251', 'ETB', 'en', 'region', NULL, false, 73),
  ('FK', 'Falkland Islands', false, '500', 'FKP', 'en', 'region', NULL, false, 74),
  ('FO', 'Faroe Islands', false, '298', 'DKK', 'en', 'region', NULL, false, 75),
  ('FJ', 'Fiji', false, '679', 'FJD', 'en', 'region', NULL, false, 76),
  ('FI', 'Finland', false, '358', 'EUR', 'fi', 'region', NULL, true, 77),
  ('FR', 'France', false, '33', 'EUR', 'fr', 'region', NULL, true, 78),
  ('GF', 'French Guiana', false, '594', 'EUR', 'en', 'region', NULL, false, 79),
  ('PF', 'French Polynesia', false, '689', 'XPF', 'en', 'region', NULL, false, 80),
  ('GA', 'Gabon', false, '241', 'XAF', 'en', 'region', NULL, false, 81),
  ('GM', 'Gambia', false, '220', 'GMD', 'en', 'region', NULL, false, 82),
  ('GE', 'Georgia', false, '995', 'GEL', 'ka', 'region', NULL, false, 83),
  ('DE', 'Germany', false, '49', 'EUR', 'de', 'region', NULL, true, 84),
  ('GH', 'Ghana', false, '233', 'GHS', 'en', 'region', NULL, false, 85),
  ('GI', 'Gibraltar', false, '350', 'GIP', 'en', 'region', NULL, true, 86),
  ('GR', 'Greece', false, '30', 'EUR', 'el', 'region', NULL, true, 87),
  ('GL', 'Greenland', false, '299', 'DKK', 'en', 'region', NULL, false, 88),
  ('GD', 'Grenada', false, '1', 'XCD', 'en', 'region', NULL, false, 89),
  ('GP', 'Guadeloupe', false, '590', 'EUR', 'en', 'region', NULL, false, 90),
  ('GU', 'Guam', false, '1', 'USD', 'en', 'region', NULL, false, 91),
  ('GT', 'Guatemala', false, '502', 'GTQ', 'es', 'region', NULL, false, 92),
  ('GG', 'Guernsey', false, '44', 'GBP', 'en', 'region', NULL, false, 93),
  ('GN', 'Guinea', false, '224', 'GNF', 'en', 'region', NULL, false, 94),
  ('GW', 'Guinea-Bissau', false, '245', 'XOF', 'en', 'region', NULL, false, 95),
  ('GY', 'Guyana', false, '592', 'GYD', 'en', 'region', NULL, false, 96),
  ('HT', 'Haiti', false, '509', 'HTG', 'en', 'region', NULL, false, 97),
  ('HN', 'Honduras', false, '504', 'HNL', 'es', 'region', NULL, false, 98),
  ('HK', 'Hong Kong SAR China', false, '852', 'HKD', 'zh', 'region', NULL, true, 99),
  ('HU', 'Hungary', false, '36', 'HUF', 'hu', 'region', NULL, true, 100),
  ('IS', 'Iceland', false, '354', 'ISK', 'en', 'region', NULL, false, 101),
  ('IN', 'India', false, '91', 'INR', 'hi', 'region', NULL, false, 102),
  ('ID', 'Indonesia', false, '62', 'IDR', 'id', 'region', NULL, false, 103),
  ('IR', 'Iran', false, '98', 'IRR', 'fa', 'region', NULL, false, 104),
  ('IQ', 'Iraq', false, '964', 'IQD', 'ar', 'region', NULL, false, 105),
  ('IE', 'Ireland', false, '353', 'EUR', 'en', 'region', NULL, true, 106),
  ('IM', 'Isle of Man', false, '44', 'GBP', 'en', 'region', NULL, false, 107),
  ('IL', 'Israel', false, '972', 'ILS', 'he', 'region', NULL, false, 108),
  ('IT', 'Italy', false, '39', 'EUR', 'it', 'region', NULL, true, 109),
  ('JM', 'Jamaica', false, '1', 'JMD', 'en', 'region', NULL, false, 110),
  ('JP', 'Japan', false, '81', 'JPY', 'ja', 'region', NULL, true, 111),
  ('JE', 'Jersey', false, '44', 'GBP', 'en', 'region', NULL, false, 112),
  ('JO', 'Jordan', false, '962', 'JOD', 'ar', 'region', NULL, false, 113),
  ('KZ', 'Kazakhstan', false, '7', 'KZT', 'ru', 'region', NULL, false, 114),
  ('KE', 'Kenya', false, '254', 'KES', 'en', 'region', NULL, false, 115),
  ('KI', 'Kiribati', false, '686', 'AUD', 'en', 'region', NULL, false, 116),
  ('XK', 'Kosovo', false, '383', 'EUR', 'en', 'region', NULL, false, 117),
  ('KW', 'Kuwait', false, '965', 'KWD', 'ar', 'region', NULL, false, 118),
  ('KG', 'Kyrgyzstan', false, '996', 'KGS', 'ru', 'region', NULL, false, 119),
  ('LA', 'Laos', false, '856', 'LAK', 'en', 'region', NULL, false, 120),
  ('LV', 'Latvia', false, '371', 'EUR', 'lv', 'region', NULL, true, 121),
  ('LB', 'Lebanon', false, '961', 'LBP', 'ar', 'region', NULL, false, 122),
  ('LS', 'Lesotho', false, '266', 'LSL', 'en', 'region', NULL, false, 123),
  ('LR', 'Liberia', false, '231', 'LRD', 'en', 'region', NULL, false, 124),
  ('LY', 'Libya', false, '218', 'LYD', 'en', 'region', NULL, false, 125),
  ('LI', 'Liechtenstein', false, '423', 'CHF', 'en', 'region', NULL, true, 126),
  ('LT', 'Lithuania', false, '370', 'EUR', 'lt', 'region', NULL, true, 127),
  ('LU', 'Luxembourg', false, '352', 'EUR', 'en', 'region', NULL, true, 128),
  ('MO', 'Macao SAR China', false, '853', 'MOP', 'en', 'region', NULL, false, 129),
  ('MG', 'Madagascar', false, '261', 'MGA', 'en', 'region', NULL, false, 130),
  ('MW', 'Malawi', false, '265', 'MWK', 'en', 'region', NULL, false, 131),
  ('MY', 'Malaysia', false, '60', 'MYR', 'ms', 'region', NULL, false, 132),
  ('MV', 'Maldives', false, '960', 'MVR', 'en', 'region', NULL, false, 133),
  ('ML', 'Mali', false, '223', 'XOF', 'en', 'region', NULL, false, 134),
  ('MT', 'Malta', false, '356', 'EUR', 'en', 'region', NULL, true, 135),
  ('MH', 'Marshall Islands', false, '692', 'USD', 'en', 'region', NULL, false, 136),
  ('MQ', 'Martinique', false, '596', 'EUR', 'en', 'region', NULL, false, 137),
  ('MR', 'Mauritania', false, '222', 'MRU', 'en', 'region', NULL, false, 138),
  ('MU', 'Mauritius', false, '230', 'MUR', 'en', 'region', NULL, false, 139),
  ('YT', 'Mayotte', false, '262', 'EUR', 'en', 'region', NULL, false, 140),
  ('FM', 'Micronesia', false, '691', 'USD', 'en', 'region', NULL, false, 141),
  ('MD', 'Moldova', false, '373', 'MDL', 'en', 'region', NULL, false, 142),
  ('MC', 'Monaco', false, '377', 'EUR', 'en', 'region', NULL, false, 143),
  ('MN', 'Mongolia', false, '976', 'MNT', 'en', 'region', NULL, false, 144),
  ('ME', 'Montenegro', false, '382', 'EUR', 'en', 'region', NULL, false, 145),
  ('MS', 'Montserrat', false, '1', 'XCD', 'en', 'region', NULL, false, 146),
  ('MA', 'Morocco', false, '212', 'MAD', 'ar', 'region', NULL, false, 147),
  ('MZ', 'Mozambique', false, '258', 'MZN', 'en', 'region', NULL, false, 148),
  ('MM', 'Myanmar (Burma)', false, '95', 'MMK', 'en', 'region', NULL, false, 149),
  ('NA', 'Namibia', false, '264', 'NAD', 'en', 'region', NULL, false, 150),
  ('NR', 'Nauru', false, '674', 'AUD', 'en', 'region', NULL, false, 151),
  ('NP', 'Nepal', false, '977', 'NPR', 'en', 'region', NULL, false, 152),
  ('NL', 'Netherlands', false, '31', 'EUR', 'nl', 'region', NULL, true, 153),
  ('NC', 'New Caledonia', false, '687', 'XPF', 'en', 'region', NULL, false, 154),
  ('NZ', 'New Zealand', false, '64', 'NZD', 'en', 'region', NULL, true, 155),
  ('NI', 'Nicaragua', false, '505', 'NIO', 'es', 'region', NULL, false, 156),
  ('NE', 'Niger', false, '227', 'XOF', 'en', 'region', NULL, false, 157),
  ('NG', 'Nigeria', false, '234', 'NGN', 'en', 'region', NULL, false, 158),
  ('NU', 'Niue', false, '683', 'NZD', 'en', 'region', NULL, false, 159),
  ('NF', 'Norfolk Island', false, '672', 'AUD', 'en', 'region', NULL, false, 160),
  ('KP', 'North Korea', false, '850', 'KPW', 'en', 'region', NULL, false, 161),
  ('MK', 'North Macedonia', false, '389', 'MKD', 'en', 'region', NULL, false, 162),
  ('MP', 'Northern Mariana Islands', false, '1', 'USD', 'en', 'region', NULL, false, 163),
  ('NO', 'Norway', false, '47', 'NOK', 'nb', 'region', NULL, true, 164),
  ('OM', 'Oman', false, '968', 'OMR', 'ar', 'region', NULL, false, 165),
  ('PK', 'Pakistan', false, '92', 'PKR', 'ur', 'region', NULL, false, 166),
  ('PW', 'Palau', false, '680', 'USD', 'en', 'region', NULL, false, 167),
  ('PS', 'Palestinian Territories', false, '970', 'ILS', 'en', 'region', NULL, false, 168),
  ('PA', 'Panama', false, '507', 'PAB', 'es', 'region', NULL, false, 169),
  ('PG', 'Papua New Guinea', false, '675', 'PGK', 'en', 'region', NULL, false, 170),
  ('PY', 'Paraguay', false, '595', 'PYG', 'es', 'region', NULL, false, 171),
  ('PE', 'Peru', false, '51', 'PEN', 'es', 'region', NULL, false, 172),
  ('PH', 'Philippines', false, '63', 'PHP', 'en', 'region', NULL, false, 173),
  ('PL', 'Poland', false, '48', 'PLN', 'pl', 'region', NULL, true, 174),
  ('PT', 'Portugal', false, '351', 'EUR', 'pt', 'region', NULL, true, 175),
  ('PR', 'Puerto Rico', false, '1', 'USD', 'es', 'region', NULL, false, 176),
  ('QA', 'Qatar', false, '974', 'QAR', 'ar', 'region', NULL, false, 177),
  ('RE', 'Réunion', false, '262', 'EUR', 'en', 'region', NULL, false, 178),
  ('RO', 'Romania', false, '40', 'RON', 'ro', 'region', NULL, true, 179),
  ('RU', 'Russia', false, '7', 'RUB', 'ru', 'region', NULL, false, 180),
  ('RW', 'Rwanda', false, '250', 'RWF', 'en', 'region', NULL, false, 181),
  ('WS', 'Samoa', false, '685', 'WST', 'en', 'region', NULL, false, 182),
  ('SM', 'San Marino', false, '378', 'EUR', 'en', 'region', NULL, false, 183),
  ('ST', 'São Tomé & Príncipe', false, '239', 'STN', 'en', 'region', NULL, false, 184),
  ('SA', 'Saudi Arabia', false, '966', 'SAR', 'ar', 'region', NULL, false, 185),
  ('SN', 'Senegal', false, '221', 'XOF', 'en', 'region', NULL, false, 186),
  ('RS', 'Serbia', false, '381', 'RSD', 'sr', 'region', NULL, false, 187),
  ('SC', 'Seychelles', false, '248', 'SCR', 'en', 'region', NULL, false, 188),
  ('SL', 'Sierra Leone', false, '232', 'SLE', 'en', 'region', NULL, false, 189),
  ('SG', 'Singapore', false, '65', 'SGD', 'en', 'region', NULL, true, 190),
  ('SX', 'Sint Maarten', false, '1', 'XCG', 'en', 'region', NULL, false, 191),
  ('SK', 'Slovakia', false, '421', 'EUR', 'sk', 'region', NULL, true, 192),
  ('SI', 'Slovenia', false, '386', 'EUR', 'sl', 'region', NULL, true, 193),
  ('SB', 'Solomon Islands', false, '677', 'SBD', 'en', 'region', NULL, false, 194),
  ('SO', 'Somalia', false, '252', 'SOS', 'en', 'region', NULL, false, 195),
  ('ZA', 'South Africa', false, '27', 'ZAR', 'en', 'region', NULL, false, 196),
  ('KR', 'South Korea', false, '82', 'KRW', 'ko', 'region', NULL, false, 197),
  ('SS', 'South Sudan', false, '211', 'SSP', 'en', 'region', NULL, false, 198),
  ('ES', 'Spain', false, '34', 'EUR', 'es', 'region', NULL, true, 199),
  ('LK', 'Sri Lanka', false, '94', 'LKR', 'en', 'region', NULL, false, 200),
  ('BL', 'St. Barthélemy', false, '590', 'EUR', 'en', 'region', NULL, false, 201),
  ('SH', 'St. Helena', false, '290', 'SHP', 'en', 'region', NULL, false, 202),
  ('KN', 'St. Kitts & Nevis', false, '1', 'XCD', 'en', 'region', NULL, false, 203),
  ('LC', 'St. Lucia', false, '1', 'XCD', 'en', 'region', NULL, false, 204),
  ('MF', 'St. Martin', false, '590', 'EUR', 'en', 'region', NULL, false, 205),
  ('PM', 'St. Pierre & Miquelon', false, '508', 'EUR', 'en', 'region', NULL, false, 206),
  ('VC', 'St. Vincent & Grenadines', false, '1', 'XCD', 'en', 'region', NULL, false, 207),
  ('SD', 'Sudan', false, '249', 'SDG', 'en', 'region', NULL, false, 208),
  ('SR', 'Suriname', false, '597', 'SRD', 'en', 'region', NULL, false, 209),
  ('SJ', 'Svalbard & Jan Mayen', false, '47', 'NOK', 'en', 'region', NULL, false, 210),
  ('SE', 'Sweden', false, '46', 'SEK', 'sv', 'region', NULL, true, 211),
  ('CH', 'Switzerland', false, '41', 'CHF', 'de', 'region', NULL, true, 212),
  ('SY', 'Syria', false, '963', 'SYP', 'en', 'region', NULL, false, 213),
  ('TW', 'Taiwan', false, '886', 'TWD', 'zh', 'region', NULL, false, 214),
  ('TJ', 'Tajikistan', false, '992', 'TJS', 'en', 'region', NULL, false, 215),
  ('TZ', 'Tanzania', false, '255', 'TZS', 'en', 'region', NULL, false, 216),
  ('TH', 'Thailand', false, '66', 'THB', 'th', 'region', NULL, true, 217),
  ('TL', 'Timor-Leste', false, '670', 'USD', 'en', 'region', NULL, false, 218),
  ('TG', 'Togo', false, '228', 'XOF', 'en', 'region', NULL, false, 219),
  ('TK', 'Tokelau', false, '690', 'NZD', 'en', 'region', NULL, false, 220),
  ('TO', 'Tonga', false, '676', 'TOP', 'en', 'region', NULL, false, 221),
  ('TT', 'Trinidad & Tobago', false, '1', 'TTD', 'en', 'region', NULL, false, 222),
  ('TN', 'Tunisia', false, '216', 'TND', 'ar', 'region', NULL, false, 223),
  ('TR', 'Türkiye', false, '90', 'TRY', 'tr', 'region', NULL, false, 224),
  ('TM', 'Turkmenistan', false, '993', 'TMT', 'en', 'region', NULL, false, 225),
  ('TC', 'Turks & Caicos Islands', false, '1', 'USD', 'en', 'region', NULL, false, 226),
  ('TV', 'Tuvalu', false, '688', 'AUD', 'en', 'region', NULL, false, 227),
  ('VI', 'U.S. Virgin Islands', false, '1', 'USD', 'en', 'region', NULL, false, 228),
  ('UG', 'Uganda', false, '256', 'UGX', 'en', 'region', NULL, false, 229),
  ('UA', 'Ukraine', false, '380', 'UAH', 'uk', 'region', NULL, false, 230),
  ('AE', 'United Arab Emirates', false, '971', 'AED', 'ar', 'region', NULL, true, 231),
  ('GB', 'United Kingdom', false, '44', 'GBP', 'en', 'region', NULL, true, 232),
  ('UY', 'Uruguay', false, '598', 'UYU', 'es', 'region', NULL, false, 233),
  ('UZ', 'Uzbekistan', false, '998', 'UZS', 'uz', 'region', NULL, false, 234),
  ('VU', 'Vanuatu', false, '678', 'VUV', 'en', 'region', NULL, false, 235),
  ('VA', 'Vatican City', false, '39', 'EUR', 'en', 'region', NULL, false, 236),
  ('VE', 'Venezuela', false, '58', 'VES', 'es', 'region', NULL, false, 237),
  ('VN', 'Vietnam', false, '84', 'VND', 'vi', 'region', NULL, false, 238),
  ('WF', 'Wallis & Futuna', false, '681', 'XPF', 'en', 'region', NULL, false, 239),
  ('EH', 'Western Sahara', false, '212', 'MAD', 'en', 'region', NULL, false, 240),
  ('YE', 'Yemen', false, '967', 'YER', 'ar', 'region', NULL, false, 241),
  ('ZM', 'Zambia', false, '260', 'ZMW', 'en', 'region', NULL, false, 242),
  ('ZW', 'Zimbabwe', false, '263', 'ZWG', 'en', 'region', NULL, false, 243)
ON CONFLICT ("code") DO NOTHING;

UPDATE "countries" SET "enabled_at" = CURRENT_TIMESTAMP WHERE "code" = 'US' AND "enabled_at" IS NULL;

INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('countries.notify_waitlist', 'true'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "states" ("code", "name", "is_active", "country_code", "iso_code") VALUES
  ('AB', 'Alberta', true, 'CA', 'CA-AB'),
  ('BC', 'British Columbia', true, 'CA', 'CA-BC'),
  ('MB', 'Manitoba', true, 'CA', 'CA-MB'),
  ('NB', 'New Brunswick', true, 'CA', 'CA-NB'),
  ('NL', 'Newfoundland and Labrador', true, 'CA', 'CA-NL'),
  ('NS', 'Nova Scotia', true, 'CA', 'CA-NS'),
  ('NT', 'Northwest Territories', true, 'CA', 'CA-NT'),
  ('NU', 'Nunavut', true, 'CA', 'CA-NU'),
  ('ON', 'Ontario', true, 'CA', 'CA-ON'),
  ('PE', 'Prince Edward Island', true, 'CA', 'CA-PE'),
  ('QC', 'Quebec', true, 'CA', 'CA-QC'),
  ('SK', 'Saskatchewan', true, 'CA', 'CA-SK'),
  ('YT', 'Yukon', true, 'CA', 'CA-YT'),
  ('01', 'Aguascalientes', true, 'MX', 'MX-AGU'),
  ('02', 'Baja California', true, 'MX', 'MX-BCN'),
  ('03', 'Baja California Sur', true, 'MX', 'MX-BCS'),
  ('04', 'Campeche', true, 'MX', 'MX-CAM'),
  ('05', 'Coahuila', true, 'MX', 'MX-COA'),
  ('06', 'Colima', true, 'MX', 'MX-COL'),
  ('07', 'Chiapas', true, 'MX', 'MX-CHP'),
  ('08', 'Chihuahua', true, 'MX', 'MX-CHH'),
  ('09', 'Ciudad de México', true, 'MX', 'MX-CMX'),
  ('10', 'Durango', true, 'MX', 'MX-DUR'),
  ('11', 'Guanajuato', true, 'MX', 'MX-GUA'),
  ('12', 'Guerrero', true, 'MX', 'MX-GRO'),
  ('13', 'Hidalgo', true, 'MX', 'MX-HID'),
  ('14', 'Jalisco', true, 'MX', 'MX-JAL'),
  ('15', 'Estado de México', true, 'MX', 'MX-MEX'),
  ('16', 'Michoacán', true, 'MX', 'MX-MIC'),
  ('17', 'Morelos', true, 'MX', 'MX-MOR'),
  ('18', 'Nayarit', true, 'MX', 'MX-NAY'),
  ('19', 'Nuevo León', true, 'MX', 'MX-NLE'),
  ('20', 'Oaxaca', true, 'MX', 'MX-OAX'),
  ('21', 'Puebla', true, 'MX', 'MX-PUE'),
  ('22', 'Querétaro', true, 'MX', 'MX-QUE'),
  ('23', 'Quintana Roo', true, 'MX', 'MX-ROO'),
  ('24', 'San Luis Potosí', true, 'MX', 'MX-SLP'),
  ('25', 'Sinaloa', true, 'MX', 'MX-SIN'),
  ('26', 'Sonora', true, 'MX', 'MX-SON'),
  ('27', 'Tabasco', true, 'MX', 'MX-TAB'),
  ('28', 'Tamaulipas', true, 'MX', 'MX-TAM'),
  ('29', 'Tlaxcala', true, 'MX', 'MX-TLA'),
  ('30', 'Veracruz', true, 'MX', 'MX-VER'),
  ('31', 'Yucatán', true, 'MX', 'MX-YUC'),
  ('32', 'Zacatecas', true, 'MX', 'MX-ZAC')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO treasury_expenses (name, monthly_cents, source, sort)
SELECT v.name, v.monthly_cents, v.source, v.sort
FROM (VALUES
  ('AWS (серверы, файлы, почта)', 14000, 'aws', 0),
  ('CockroachDB Cloud (база)', 0, 'manual', 1),
  ('Twilio (SMS)', 2000, 'manual', 2),
  ('Bunny Stream (видео)', 1000, 'manual', 3),
  ('Firebase (пуши)', 0, 'manual', 4),
  ('Apple Developer ($99 в год)', 825, 'manual', 5),
  ('Домен lawbid.dev', 200, 'manual', 6)
) AS v(name, monthly_cents, source, sort)
WHERE NOT EXISTS (SELECT 1 FROM treasury_expenses);

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('news_posts', false, 100, 'News: the News topic, the Post/News switch and the profile News tab', now())
ON CONFLICT (key) DO NOTHING;

UPDATE feature_flags SET enabled = false, updated_at = now() WHERE key = 'payments_in_app';

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('email_login', false, 100, 'E-mail sign-in and every e-mail flow in the app (add e-mail, client e-mail step, firm e-mail, e-mail notifications, waiting list). Off: phone, Google and Apple only.', now())
ON CONFLICT (key) DO UPDATE
SET enabled = false, description = excluded.description, updated_at = now();
