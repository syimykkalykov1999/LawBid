-- Owner 2026-10-05: plan builder — plans with entitlements assembled in the
-- admin, client plans, subscriptions frozen to the plan they bought
-- (additive; nothing existing changes shape).
ALTER TABLE plan_prices ALTER COLUMN kind TYPE VARCHAR(64);

CREATE TABLE IF NOT EXISTS plans (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL,
  audience VARCHAR(16) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'paid',
  name JSONB NOT NULL DEFAULT '{}',
  tagline JSONB NOT NULL DEFAULT '{}',
  description JSONB NOT NULL DEFAULT '{}',
  interval VARCHAR(8),
  price_kind VARCHAR(64),
  entitlements JSONB NOT NULL DEFAULT '{}',
  highlights JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  sort INT4 NOT NULL DEFAULT 0,
  is_default BOOL NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS plans_code_key ON plans (code);
CREATE INDEX IF NOT EXISTS plans_audience_idx ON plans (audience, status, sort);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS entitlements JSONB;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS client_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID,
  stripe_checkout_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(16) NOT NULL DEFAULT 'incomplete',
  price_cents INT4 NOT NULL DEFAULT 0,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOL NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  entitlements JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT client_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT client_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS client_subscriptions_user_id_key ON client_subscriptions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_subscriptions_stripe_subscription_id_key ON client_subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS client_subscriptions_status_idx ON client_subscriptions (status, current_period_end);
