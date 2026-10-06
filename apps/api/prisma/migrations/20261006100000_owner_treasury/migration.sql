-- Owner 2026-10-05 «Прибыль и резерв»: only net profit reaches the owner's
-- card; the money for services, salaries and partners stays apart.
-- Additive (new tables only).

-- 1. What the services charge the expense card a month.
CREATE TABLE IF NOT EXISTS treasury_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  monthly_cents INT4 NOT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'manual',
  active BOOL NOT NULL DEFAULT true,
  sort INT4 NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT treasury_expenses_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS treasury_expenses_active_sort_idx ON treasury_expenses (active, sort);

-- Starting list (estimates; the owner corrects them in Деньги → Прибыль и
-- резерв). Inserted only into an empty table, so a re-run adds nothing.
INSERT INTO treasury_expenses (name, monthly_cents, source, sort)
SELECT v.name, v.monthly_cents, v.source, v.sort
FROM (VALUES
  ('AWS (серверы, файлы, почта)', 14000, 'aws', 0),
  ('CockroachDB Cloud (база)', 0, 'manual', 1),
  ('Twilio (SMS)', 2000, 'manual', 2),
  ('Bunny Stream (видео)', 1000, 'manual', 3),
  ('Firebase (пуши)', 0, 'manual', 4),
  ('Apple Developer ($99 в год)', 825, 'manual', 5),
  ('Домен lawbid.dev', 200, 'manual', 6)
) AS v(name, monthly_cents, source, sort)
WHERE NOT EXISTS (SELECT 1 FROM treasury_expenses);

-- 2. Payouts of the monthly split (Stripe balance → a bank in Stripe).
CREATE TABLE IF NOT EXISTS treasury_payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  key VARCHAR(80) NOT NULL,
  period VARCHAR(7) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  trigger VARCHAR(8) NOT NULL DEFAULT 'auto',
  amount_cents INT4 NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  destination_id VARCHAR(64) NULL,
  destination_label VARCHAR(80) NULL,
  stripe_payout_id VARCHAR(64) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  failure VARCHAR(300) NULL,
  plan JSONB NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT treasury_payouts_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_payouts_key_key ON treasury_payouts (key);
CREATE INDEX IF NOT EXISTS treasury_payouts_period_kind_idx ON treasury_payouts (period, kind);
CREATE INDEX IF NOT EXISTS treasury_payouts_status_idx ON treasury_payouts (status);
CREATE INDEX IF NOT EXISTS treasury_payouts_created_at_idx ON treasury_payouts (created_at DESC);
