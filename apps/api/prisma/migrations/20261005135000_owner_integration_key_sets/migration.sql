-- Owner 2026-10-05: several key sets per service (primary + fallbacks or
-- several accounts) and services added from the admin. Additive: every
-- existing row becomes the "main" set.
ALTER TABLE integration_credentials ADD COLUMN IF NOT EXISTS slot STRING NOT NULL DEFAULT 'main';
ALTER TABLE integration_credentials ADD COLUMN IF NOT EXISTS label STRING NULL;
ALTER TABLE integration_credentials ADD COLUMN IF NOT EXISTS priority INT4 NOT NULL DEFAULT 0;
ALTER TABLE integration_credentials ADD COLUMN IF NOT EXISTS enabled BOOL NOT NULL DEFAULT true;

-- At most one active version per key set (was: per provider).
DROP INDEX IF EXISTS integration_credentials@integration_credentials_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS integration_credentials_one_active_slot
  ON integration_credentials (provider, slot) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS integration_custom_providers (
  id STRING NOT NULL,
  label STRING NOT NULL,
  description STRING NOT NULL DEFAULT '',
  fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_custom_providers_pkey PRIMARY KEY (id)
);
