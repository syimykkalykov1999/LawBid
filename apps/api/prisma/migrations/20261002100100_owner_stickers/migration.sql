-- Owner 2026-10-01: sticker packs like Telegram. Anyone makes their own
-- packs ("+"), installs anyone's pack from a sticker in a chat, the owner
-- publishes official packs from the admin panel and hides bad ones.
CREATE TABLE sticker_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  -- NULL = official (made in the admin panel).
  owner_user_id UUID NULL,
  title STRING(64) NOT NULL,
  short_name STRING(40) NOT NULL,
  is_official BOOL NOT NULL DEFAULT false,
  -- active | hidden (admin moderation).
  status STRING(16) NOT NULL DEFAULT 'active',
  sticker_count INT4 NOT NULL DEFAULT 0,
  install_count INT4 NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT sticker_packs_pkey PRIMARY KEY (id),
  CONSTRAINT sticker_packs_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT sticker_packs_status_check CHECK (status IN ('active', 'hidden')),
  UNIQUE INDEX sticker_packs_short_name_key (short_name),
  INDEX sticker_packs_owner_idx (owner_user_id, created_at DESC),
  INDEX sticker_packs_official_idx (is_official, status, install_count DESC)
);

CREATE TABLE stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL,
  file_id UUID NOT NULL,
  emoji STRING(16) NOT NULL DEFAULT '🙂',
  position INT4 NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT stickers_pkey PRIMARY KEY (id),
  CONSTRAINT stickers_pack_fkey FOREIGN KEY (pack_id) REFERENCES sticker_packs (id) ON DELETE CASCADE,
  CONSTRAINT stickers_file_fkey FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE RESTRICT,
  UNIQUE INDEX stickers_file_id_key (file_id),
  INDEX stickers_pack_position_idx (pack_id, position)
);

CREATE TABLE user_sticker_packs (
  user_id UUID NOT NULL,
  pack_id UUID NOT NULL,
  position INT4 NOT NULL DEFAULT 0,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_sticker_packs_pkey PRIMARY KEY (user_id, pack_id),
  CONSTRAINT user_sticker_packs_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_sticker_packs_pack_fkey FOREIGN KEY (pack_id) REFERENCES sticker_packs (id) ON DELETE CASCADE,
  INDEX user_sticker_packs_pack_idx (pack_id)
);

CREATE TABLE user_recent_stickers (
  user_id UUID NOT NULL,
  sticker_id UUID NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_recent_stickers_pkey PRIMARY KEY (user_id, sticker_id),
  CONSTRAINT user_recent_stickers_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_recent_stickers_sticker_fkey FOREIGN KEY (sticker_id) REFERENCES stickers (id) ON DELETE CASCADE,
  INDEX user_recent_stickers_used_idx (user_id, used_at DESC)
);

ALTER TABLE messages ADD COLUMN sticker_id UUID NULL;
ALTER TABLE messages ADD CONSTRAINT messages_sticker_fkey FOREIGN KEY (sticker_id) REFERENCES stickers (id) ON DELETE SET NULL;
CREATE INDEX messages_sticker_id_idx ON messages (sticker_id);
