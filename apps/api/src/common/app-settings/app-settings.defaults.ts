// docs/03_VERIFICATION_PROFILES.md §9: tunables stored in app_config and
// changed from the admin panel without a release. These are the spec's
// default values: prisma/seed.ts seeds them (never overwriting an edited
// value) and AppSettingsService falls back to them when a key is missing
// or has the wrong type.
export const FILE_03_SETTINGS = {
  'verification.max_submissions_30d': 5,
  'verification.signed_url_ttl_sec': 300,
  'verification.license_expiry_notify_days': [30, 7],
  'profile.username_change_cooldown_days': 30,
  // §9 names the key ("список") without contents: a starter list of names
  // that would impersonate the platform or collide with app routes.
  'profile.reserved_usernames': [
    'admin',
    'administrator',
    'api',
    'help',
    'lawbid',
    'legal',
    'me',
    'moderator',
    'official',
    'root',
    'security',
    'settings',
    'support',
    'system',
    'verifier',
    'www',
  ],
  'review.edit_window_days': 14,
  'review.reminder_after_days': 7,
  // Voice messages and other files outside «Загрузки и файлы» (bug 17).
  'files.max_size_mb': 10,
} as const;

export type File03SettingKey = keyof typeof FILE_03_SETTINGS;

// docs/04_CASES_BIDS.md §14 (stage 4.1 migration also inserts it): after
// this many confirmed "can't reach the client" reports the client account
// is suspended (§8.4).
export const FILE_04_SETTINGS = {
  'contacts.suspend_after_confirmed_reports': 3,
} as const;

// docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §13, §14 (stage 5.1): per-user
// action limits (429 RATE_LIMITED past them) and notification retention.
export const FILE_05_SETTINGS = {
  'rate_limit.post_create_per_day': 10,
  'rate_limit.comment_per_hour': 30,
  'rate_limit.like_per_hour': 300,
  'rate_limit.follow_per_day': 200,
  'rate_limit.message_per_minute': 60,
  'rate_limit.search_per_minute': 30,
  'rate_limit.report_per_day': 20,
  'notifications.retention_days': 180,
} as const;

// docs/06_PRODUCTION.md §1.2, §3.3, §10 (stage 6.1): subscription grace and
// the rule-based moderation lists/thresholds (edited in the admin panel).
export const FILE_06_SETTINGS = {
  'subscription.past_due_grace_days': 3,
  'moderation.blocked_terms': [] as string[],
  'moderation.hold_terms': [] as string[],
  'moderation.auto_hide_reports': 3,
  // §3.3 "массовые ссылки" / "повторяющийся текст от одного автора" → hold.
  'moderation.max_links': 3,
  'moderation.duplicate_window_hours': 24,
} as const;

// Owner 2026-10-01: video reels (Bunny Stream) and stickers — tunables the
// owner changes from the admin panel without a release.
export const OWNER_MEDIA_SETTINGS = {
  'video.max_duration_sec': 90,
  'video.max_size_mb': 500,
  'video.upload_ttl_min': 60,
  'video.playback_ttl_sec': 21600,
  'video.max_pending_per_user': 3,
  'rate_limit.video_upload_per_day': 10,
  'stickers.max_own_packs': 20,
  'stickers.max_per_pack': 120,
  'stickers.max_installed': 200,
  'stickers.recent_max': 30,
  'rate_limit.sticker_pack_create_per_day': 5,
  'rate_limit.sticker_add_per_hour': 60,
  'files.sticker_max_size_mb': 1,
  // Owner 2026-10-05: a reel may be cut from a longer video (trim); the
  // played part stays ≤ video.max_duration_sec.
  'video.max_source_duration_sec': 180,
  // Owner 2026-10-05: photos (posts, reels, cases, reviews; avatars by
  // their own size) are shrunk on the phone before upload — longest side,
  // JPEG quality — no visible loss, small files. Videos are re-encoded by
  // Bunny for viewers.
  'media.photo_max_px': 2048,
  'media.photo_quality': 85,
  'media.avatar_max_px': 1024,
  // Owner 2026-10-05: reels are re-encoded on the phone before upload —
  // at most this height (1080 = Full HD, no visible loss on a phone),
  // 0 = upload as recorded. Frame rate cap keeps files small.
  'media.video_max_height': 1080,
  'media.video_frame_rate': 30,
  // Owner 2026-10-05: document templates the admin uploads (PDF, Word).
  'files.document_template_max_size_mb': 10,
} as const;

// Owner 2026-10-02: support tickets — per-user limits (429 RATE_LIMITED).
export const OWNER_SUPPORT_SETTINGS = {
  'rate_limit.support_ticket_per_hour': 5,
  'rate_limit.support_message_per_hour': 30,
} as const;

// Owner 2026-10-02: the paid gold badge of a client (cents per month).
export const OWNER_BADGE_SETTINGS = {
  'verification.client_badge_cents': 1000,
} as const;

// Owner 2026-10-04: an attorney enters state + bar number and confirms
// them under a sworn statement; the request is then approved at once
// (`self_attestation_auto_approve`, off = verifier queue as before). A
// photo of the bar card and ID + selfie are asked for only when switched
// on here (or, for ID + selfie, after a name change).
export const OWNER_LAWYER_VERIFICATION_SETTINGS = {
  'verification.require_bar_document': false,
  'verification.require_identity': false,
  'verification.self_attestation_auto_approve': true,
} as const;

// Owner 2026-10-05: the planner's archive — finished tasks are kept this
// many days (files with them), then removed automatically unless kept
// forever; notices go out 30 and 7 days before. Off = never removed.
export const OWNER_TASKS_SETTINGS = {
  'tasks.archive_retention_days': 365,
  'tasks.archive_auto_purge': true,
} as const;

// Future web client (a client form on lawbid.dev sharing this API): the
// browser origins allowed to call the API cross-origin (CORS). Localhost
// origins are added on top outside production (src/common/cors).
export const OWNER_WEB_SETTINGS = {
  'web.allowed_origins': [
    'https://lawbid.dev',
    'https://www.lawbid.dev',
  ] as string[],
};

// Owner 2026-10-05 (automation principle, docs/AUTOMATION_PRINCIPLE.md):
// every manual admin step except checking an attorney's documents has an
// "auto" switch, on by default. A client's badge request is approved the
// moment the documents are uploaded and scanned; the admin can still
// revoke it. Undecided review appeals stay as decided on 2026-10-01
// (Google-style, no automatic removal) but the switch now lives here.
export const OWNER_AUTOMATION_SETTINGS = {
  'verification.client_badge_auto_approve': true,
  'reviews.auto_remove_undecided_appeals': false,
} as const;

// Owner 2026-10-05: a client offers a case to a chosen attorney. An
// unanswered invite expires after `invites.expiry_days`; at most
// `invites.max_pending_per_case` attorneys wait on one case, and a client
// sends at most `invites.max_per_day` invites a day.
export const OWNER_INVITE_SETTINGS = {
  'invites.expiry_days': 7,
  'invites.max_pending_per_case': 10,
  'invites.max_per_day': 30,
} as const;

// Owner 2026-10-05: how many assistants an attorney may add, set in the
// admin (was a fixed 6). The yearly plan covers this many seats.
export const OWNER_SEAT_SETTINGS = {
  'billing.max_assistant_seats': 10,
} as const;

// Owner 2026-10-05: case urgency. A case with a date reads as "very
// urgent" with at most `cases.urgency_days_very_urgent` days left, and so
// on down. Client and hired attorney get reminders
// `cases.deadline_reminder_days` before the date (0 = on the day); a
// client whose date passed with no attorney hired is asked to update it.
// `cases.deadline_reminders_auto` off stops all of them.
export const OWNER_URGENCY_SETTINGS = {
  'cases.urgency_days_very_urgent': 1,
  'cases.urgency_days_urgent': 3,
  'cases.urgency_days_soon': 7,
  'cases.urgency_days_within_month': 31,
  'cases.deadline_reminder_days': [7, 3, 1, 0],
  'cases.deadline_reminders_auto': true,
} as const;

// Owner 2026-10-05: attorney trust levels (docs/ATTORNEY_TRUST.md). The
// level is computed (0 self-attested, 1 license confirmed, 2 identity
// confirmed, 3 both); these say which level each gate needs and what
// happens automatically. A hold (complaint, name mismatch) closes the
// payment / bid gates whatever the level.
export const OWNER_TRUST_SETTINGS = {
  /** Owner 2026-10-05 06:07: the master switch. Off = the pre-trust mode:
   * self-attested attorneys get the badge and payments at once, no holds,
   * no queue. Everything below only counts while this is on. */
  'trust.enabled': true,
  /** Staff review on/off. Off = automatic checks only: the documents
   * requirement is ignored and the queue is paused (kept, not lost). */
  'trust.manual_review': true,
  /** Owner 2026-10-05 («Борьба с мошенниками»): what an attorney must pass
   * before the badge and in-app payments open. Each is a switch; whatever
   * can be checked automatically is, the rest lands in the staff queue, and
   * a staff "Подтвердить" clears everything at once (no re-checks after). */
  /** The bar number matched the state registry (or staff confirmed it). */
  'trust.require_registry': true,
  /** Stripe KYC passed and the legal name (or the company's representative /
   * owner) is the attorney, or the firm link is confirmed. */
  'trust.require_identity': true,
  /** Staff checked a government ID + selfie + bar card. */
  'trust.require_documents': false,
  /** Bids too wait for the requirements (default: bids are open to every
   * self-attested attorney, only money and the badge wait). */
  'trust.bids_require_cleared': false,
  /** Stripe payout delay (days) asked for attorneys not yet cleared; 0 =
   * Stripe's default. */
  'trust.payout_delay_days': 7,
  /** A client's fraud / impersonation report → payments and new bids are
   * paused until a verifier looks. */
  'trust.auto_hold_on_complaint': true,
  /** Distinct clients reporting within the window → profile suspended. */
  'trust.complaints_to_suspend': 2,
  'trust.complaint_window_days': 90,
  /** Stripe's legal name differs from the profile / registry name →
   * payments paused and documents requested. */
  'trust.auto_hold_on_name_mismatch': true,
  /** Someone tries to register an already-registered bar number → the
   * holder's license is flagged for a registry check. */
  'trust.flag_duplicate_claims': true,
  /** Stripe company account where the attorney is neither representative
   * nor owner: the link to the firm counts automatically when the firm in
   * the state registry equals the Stripe company name, or when the
   * attorney confirms an e-mail on the firm's website domain. Off = a
   * verifier checks a letter on the firm's letterhead. */
  'trust.firm_link_auto_registry': true,
  'trust.firm_link_auto_email': true,
  /** Owner 2026-10-05 07:00: a staff «Отклонить» (and an admin suspension)
   * blocks the attorney's bar numbers: they cannot register again under
   * another name or account until staff unblock them. */
  'trust.block_on_reject': true,
  /** A block also refuses the e-mail and phone of the blocked account. */
  'trust.block_contacts': false,
} as const;

// Owner 2026-10-05: the free trial length, set in Деньги → Цены (0 = no
// trial). Applies to new trials; running ones keep their end date (an
// admin extends one attorney's trial from their subscription card).
export const OWNER_TRIAL_SETTINGS = {
  'billing.trial_days': 7,
} as const;

// Owner 2026-10-05: sections where admins other than the super admin must
// write a reason for an action (the owner never has to). Set in
// Администраторы → «Обязательная причина».
export const OWNER_REASON_SETTINGS = {
  'admin.reason_required_areas': [
    'money',
    'payroll',
    'moderation',
    'sanctions',
  ],
} as const;

/** Every typed app_config tunable with its spec default. */
/** Owner 2026-10-05: where the paid translator works (Ключи и сервисы →
 * Google Translate): 'all' zones, or only the switched-on 'zones'. */
export const OWNER_TRANSLATE_SETTINGS = {
  'translate.scope': 'all',
  'translate.chat': true,
  'translate.posts': true,
  'translate.cases': true,
  'translate.reviews': true,
  'translate.profiles': true,
};

/** Owner 2026-10-05: support 24/7 (Связь → Поддержка → Настройки).
 * New tickets go to the agents on shift; an unanswered ticket past its
 * SLA is flagged, its priority goes up and the team is told; outside the
 * opening hours (when not 24/7) the user gets an automatic answer;
 * resolved tickets close by themselves after N days (0 = never). */
export const OWNER_SUPPORT_DESK_SETTINGS = {
  'support.auto_assign': true,
  'support.sla_first_response_minutes': 60,
  'support.sla_urgent_minutes': 15,
  'support.sla_alerts': true,
  'support.escalate_on_breach': true,
  'support.always_open': true,
  'support.open_days': [1, 2, 3, 4, 5],
  'support.open_from_hour': 9,
  'support.open_to_hour': 18,
  'support.timezone': 'America/Chicago',
  'support.auto_reply': true,
  'support.auto_close_resolved_days': 7,
};

/** Owner 2026-10-05: «Лучший сотрудник». Off until the owner switches it
 * on; then the best employee of each department is chosen at the end of
 * every period (automatically unless `rewards.auto_award` is off). */
export const OWNER_REWARDS_SETTINGS = {
  'rewards.enabled': false,
  'rewards.auto_award': true,
  'rewards.period': 'month',
};

/** Owner 2026-10-05: repeat accounts of blocked fraudsters and the
 * client risk score (docs/CLIENT_FRAUD.md, Admin → Галочки → «Борьба с
 * мошенниками» → «Клиенты»). Presets set the actions and thresholds. */
export const OWNER_FRAUD_SETTINGS = {
  /** Master switch. Off = nothing is recorded or checked. */
  'fraud.enabled': true,
  /** Automation principle: actions apply by themselves. Off = everything
   * only lands in the staff queue. */
  'fraud.auto': true,
  /** A sign-in shares a phone, e-mail, Apple / Google account or card
   * with a blocked account: 'block' | 'review' (restricted until staff
   * look) | 'off'. */
  'fraud.match_action': 'block',
  /** The same for the phone (device) only: a phone can be sold or shared. */
  'fraud.device_action': 'review',
  /** Client risk score thresholds. */
  'fraud.review_score': 30,
  'fraud.restrict_score': 60,
  'fraud.ban_score': 100,
  /** Points per distinct attorney who dealt with the client and reported
   * fraud / impersonation; per other report; per card chargeback. */
  'fraud.weight_fraud_report': 25,
  'fraud.weight_report': 8,
  'fraud.weight_chargeback': 30,
  /** Complaints and cancellations older than this do not count. */
  'fraud.window_days': 180,
  /** E-mail the verifiers when an account is blocked or queued. */
  'fraud.notify_staff': true,
  /** Hashes of ordinary accounts are deleted after this many days without
   * use; those of blocked accounts are kept for the longer period. */
  'fraud.fingerprint_retention_days': 365,
  'fraud.blocked_retention_days': 1095,
} as const;

/** Owner 2026-10-05: countries (Система → Страны). People who asked to
 * be told get an e-mail by themselves when their country is switched on. */
export const OWNER_COUNTRY_SETTINGS = {
  'countries.notify_waitlist': true,
};

/** Owner 2026-10-05: requests per minute for one signed-in admin (the
 * panel keeps several queues live on one screen). Users keep 100/min.
 * ADMIN_THROTTLE_LIMIT in the env wins (src/throttler/throttle-limits.ts). */
export const OWNER_RATE_LIMIT_SETTINGS = {
  'security.admin_rate_limit_per_minute': 600,
  /** Owner 2026-10-07: sign-in codes (SMS or e-mail) one phone / e-mail
   * may ask for in a rolling 24 h, on top of the hourly limit. Range
   * 1…1000 (config-schema); 0 is refused, never "unlimited". Not seeded:
   * until an admin saves it, OTP_RATE_LIMIT_PER_IDENTIFIER_PER_DAY in the
   * env applies (default 10). */
  'security.otp_per_identifier_per_day': 10,
};

/** Owner 2026-10-05: storage like Telegram (Система → Хранилище). Every
 * switch is on by default (docs/AUTOMATION_PRINCIPLE.md):
 * - dedup: an identical upload reuses the stored object (one copy in S3);
 * - auto_cleanup: files nobody uses (uploaded but never sent, replaced
 *   avatars, photos of posts deleted N days ago) are put aside after
 *   `orphan_grace_hours`, then their objects are removed after
 *   `purge_after_days` (S3 versioning keeps a recovery copy on top);
 * - image_format: photos are stored as WebP (≈30% smaller than JPEG at
 *   the same quality) or JPEG;
 * - quotas in MB (0 = no cap): per user (an admin override lives on the
 *   user) and per chat;
 * - auto_retention: technical logs older than N days are removed;
 * - growth alert: one log alert (CloudWatch → e-mail) when files or the
 *   database grew more than `growth_alert_percent` in a day. */
export const OWNER_STORAGE_SETTINGS = {
  'storage.dedup': true,
  'storage.auto_cleanup': true,
  'storage.orphan_grace_hours': 24,
  'storage.purge_after_days': 7,
  'storage.deleted_posts_media_days': 30,
  'storage.image_format': 'webp',
  'storage.user_quota_mb': 10240,
  'storage.chat_quota_mb': 5120,
  'storage.auto_retention': true,
  'storage.retention_auth_events_days': 730,
  'storage.retention_assistant_activity_days': 365,
  'storage.retention_snapshots_days': 730,
  'storage.growth_alert_percent': 20,
};

/** Owner 2026-10-05: zero-maintenance operations (admin Система →
 * Здоровье системы). Every automatic reaction has a switch, default on. */
export const OWNER_OPS_SETTINGS = {
  /** DB answers slower than ops.db_slow_ms → heavy background jobs pause
   * for 15 minutes on their own (renewed while it stays slow). */
  'ops.auto_pause_heavy_jobs': true,
  'ops.db_slow_ms': 800,
  /** AWS spend reached the monthly budget → api/worker autoscaling capped
   * at the minimum until the next month (or until the owner lifts it). */
  'ops.auto_scale_down_on_budget': true,
  /** The newest CockroachDB Cloud backup older than this → alert. */
  'ops.backup_max_age_hours': 26,
};

/** Owner 2026-10-05 «Прибыль и резерв» (Деньги): the monthly split of the
 * Stripe balance into «Расходы» (services, salaries paid from the bank),
 * a reserve that stays on Stripe and «Прибыль» for the owner. */
export const OWNER_TREASURY_SETTINGS = {
  /** Run the split on its own every month (off: only the button). */
  'treasury.auto': true,
  /** Day of the month (1…28, UTC). The 25th: the money for next month's
   * bills is in the expense account before they come. */
  'treasury.payout_day': 25,
  /** Safety cushion kept on Stripe: percent of a month of all costs. */
  'treasury.buffer_percent': 50,
  /** Kept on Stripe for refunds and disputes, dollars. */
  'treasury.refund_buffer_usd': 200,
  /** Profit smaller than this waits for the next month, dollars. */
  'treasury.min_profit_usd': 50,
  /** Owner 2026-10-06: salaries linked to Stripe go out by themselves on
   * the pay day, from the reserve on Stripe (off: «Выплатить» by hand). */
  'treasury.payroll_auto': true,
  /** Pay day of the month (1…28, UTC); a missed day runs the next day. */
  'treasury.payroll_day': 1,
  /** Warn this many days before the pay day when Stripe holds less than
   * the salaries due. */
  'treasury.payroll_warn_days': 5,
};

// Owner 2026-10-05: legal posts vs general (personal) posts. What a person
// who never chose sees: 'all' or 'legal_only' (general posts hidden).
export const OWNER_FEED_SETTINGS = {
  'feed.default_content_mode': 'all',
};

export const APP_SETTINGS = {
  ...FILE_03_SETTINGS,
  ...FILE_04_SETTINGS,
  ...FILE_05_SETTINGS,
  ...FILE_06_SETTINGS,
  ...OWNER_MEDIA_SETTINGS,
  ...OWNER_SUPPORT_SETTINGS,
  ...OWNER_BADGE_SETTINGS,
  ...OWNER_LAWYER_VERIFICATION_SETTINGS,
  ...OWNER_TASKS_SETTINGS,
  ...OWNER_WEB_SETTINGS,
  ...OWNER_AUTOMATION_SETTINGS,
  ...OWNER_INVITE_SETTINGS,
  ...OWNER_SEAT_SETTINGS,
  ...OWNER_URGENCY_SETTINGS,
  ...OWNER_TRUST_SETTINGS,
  ...OWNER_TRIAL_SETTINGS,
  ...OWNER_REASON_SETTINGS,
  ...OWNER_TRANSLATE_SETTINGS,
  ...OWNER_SUPPORT_DESK_SETTINGS,
  ...OWNER_REWARDS_SETTINGS,
  ...OWNER_COUNTRY_SETTINGS,
  ...OWNER_RATE_LIMIT_SETTINGS,
  ...OWNER_STORAGE_SETTINGS,
  ...OWNER_FRAUD_SETTINGS,
  ...OWNER_OPS_SETTINGS,
  ...OWNER_TREASURY_SETTINGS,
  ...OWNER_FEED_SETTINGS,
};

export type AppSettingKey = keyof typeof APP_SETTINGS;
