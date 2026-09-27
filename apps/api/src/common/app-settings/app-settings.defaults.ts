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
} as const;

export type File03SettingKey = keyof typeof FILE_03_SETTINGS;
