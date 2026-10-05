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
  'files.max_size_mb': 10,
  'files.avatar_max_size_mb': 5,
  // OQ-047: photos and documents in chats.
  'files.chat_max_size_mb': 25,
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
  // Owner 2026-10-05: documents in posts / reels — small on purpose.
  'files.post_attachment_max_size_mb': 10,
  'posts.attachments_max_total_mb': 30,
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

/** Every typed app_config tunable with its spec default. */
export const APP_SETTINGS = {
  ...FILE_03_SETTINGS,
  ...FILE_04_SETTINGS,
  ...FILE_05_SETTINGS,
  ...FILE_06_SETTINGS,
  ...OWNER_MEDIA_SETTINGS,
  ...OWNER_SUPPORT_SETTINGS,
  ...OWNER_BADGE_SETTINGS,
  ...OWNER_LAWYER_VERIFICATION_SETTINGS,
  ...OWNER_AUTOMATION_SETTINGS,
  ...OWNER_INVITE_SETTINGS,
  ...OWNER_SEAT_SETTINGS,
};

export type AppSettingKey = keyof typeof APP_SETTINGS;
