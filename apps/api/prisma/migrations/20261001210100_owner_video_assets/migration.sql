-- Owner 2026-10-01: one video per post, uploaded straight from the phone
-- to Bunny Stream (TUS); Bunny encodes it and tells us by webhook.
CREATE TABLE video_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  provider STRING NOT NULL DEFAULT 'bunny',
  library_id STRING NOT NULL,
  external_id STRING NOT NULL,
  status video_asset_status NOT NULL DEFAULT 'awaiting_upload',
  duration_sec INT4 NULL,
  width INT4 NULL,
  height INT4 NULL,
  storage_bytes INT8 NULL,
  failure_reason STRING NULL,
  upload_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  purged_at TIMESTAMPTZ NULL,
  CONSTRAINT video_assets_pkey PRIMARY KEY (id),
  CONSTRAINT video_assets_owner_fkey FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE INDEX video_assets_external_id_key (external_id),
  INDEX video_assets_status_created_idx (status, created_at),
  INDEX video_assets_owner_created_idx (owner_user_id, created_at DESC)
);

ALTER TABLE posts ADD COLUMN video_asset_id UUID NULL;
ALTER TABLE posts ADD CONSTRAINT posts_video_asset_fkey FOREIGN KEY (video_asset_id) REFERENCES video_assets (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX posts_video_asset_id_key ON posts (video_asset_id);
