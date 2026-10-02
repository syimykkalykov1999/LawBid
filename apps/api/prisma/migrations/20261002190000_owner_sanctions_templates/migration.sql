-- Owner 2026-10-02: admin role templates and account bans (additive).

CREATE TABLE admin_role_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT admin_role_templates_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX admin_role_templates_name_key ON admin_role_templates (name);

CREATE TABLE account_bans (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  kind VARCHAR(10) NOT NULL,
  value STRING NOT NULL,
  user_id UUID NULL,
  reason STRING NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at TIMESTAMPTZ NULL,
  lifted_by UUID NULL,
  lift_reason STRING NULL,
  CONSTRAINT account_bans_pkey PRIMARY KEY (id),
  CONSTRAINT account_bans_kind_check CHECK (kind IN ('user', 'phone', 'email', 'device'))
);
CREATE INDEX account_bans_kind_value_idx ON account_bans (kind, value);
CREATE INDEX account_bans_created_at_idx ON account_bans (created_at);
