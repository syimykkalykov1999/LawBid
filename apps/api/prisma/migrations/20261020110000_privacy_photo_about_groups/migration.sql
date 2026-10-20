-- Owner 2026-10-20: who sees my profile photo and "about", who may add me to a group.
ALTER TABLE "user_privacy_settings"
  ADD COLUMN "photo_from" "privacy_audience" NOT NULL DEFAULT 'everyone',
  ADD COLUMN "about_from" "privacy_audience" NOT NULL DEFAULT 'everyone',
  ADD COLUMN "group_add_from" "privacy_audience" NOT NULL DEFAULT 'everyone';
