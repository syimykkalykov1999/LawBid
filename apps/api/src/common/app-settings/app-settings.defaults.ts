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

/** Every typed app_config tunable with its spec default. */
export const APP_SETTINGS = {
  ...FILE_03_SETTINGS,
  ...FILE_04_SETTINGS,
  ...FILE_05_SETTINGS,
  ...FILE_06_SETTINGS,
};

export type AppSettingKey = keyof typeof APP_SETTINGS;
