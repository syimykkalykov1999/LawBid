-- Owner 2026-10-01: third-party API keys the owner manages in the admin
-- (Bunny Stream, Stripe, Twilio, FCM, TURN…). One row per provider per
-- version; the secret fields are one AES-256-GCM envelope (master key from
-- env SECRETS_MASTER_KEYS, AAD "provider:version"). A new version waits as
-- `pending` until it is tested and activated; the previous one stays as
-- `retired` for a one-step rollback.
CREATE TYPE integration_credential_status AS ENUM ('pending', 'active', 'retired');

CREATE TABLE integration_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  provider STRING NOT NULL,
  version INT4 NOT NULL,
  status integration_credential_status NOT NULL DEFAULT 'pending',
  secret_enc STRING NOT NULL,
  kid STRING NOT NULL,
  public_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  masked JSONB NOT NULL DEFAULT '{}'::JSONB,
  fingerprint STRING NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ NULL,
  retired_at TIMESTAMPTZ NULL,
  last_test_at TIMESTAMPTZ NULL,
  last_test_ok BOOL NULL,
  last_test_error STRING NULL,
  CONSTRAINT integration_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT integration_credentials_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE INDEX integration_credentials_provider_version_key (provider, version)
);

-- At most one active version per provider.
CREATE UNIQUE INDEX integration_credentials_one_active
  ON integration_credentials (provider) WHERE status = 'active';
