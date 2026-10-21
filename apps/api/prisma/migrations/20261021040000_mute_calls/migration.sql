-- Owner 2026-10-21: «mute calls» per chat / group, and own switches for
-- groups and channels in Settings → Notifications.
ALTER TABLE conversation_participants ADD COLUMN calls_muted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat_group_members ADD COLUMN calls_muted BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'groups';
ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'channels';
