-- Owner 2026-10-03: plan prices edited in the admin (additive).
CREATE TABLE IF NOT EXISTS plan_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  kind VARCHAR(16) NOT NULL,
  amount_cents INT4 NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  active BOOL NOT NULL DEFAULT true,
  stripe_price_ids JSONB NOT NULL DEFAULT '{}',
  stripe_product_ids JSONB NOT NULL DEFAULT '{}',
  note VARCHAR(300),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_prices_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS plan_prices_kind_idx ON plan_prices (kind, active, created_at DESC);
