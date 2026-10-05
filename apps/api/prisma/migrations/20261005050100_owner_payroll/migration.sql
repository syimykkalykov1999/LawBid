-- Owner 2026-10-05: staff salaries in the admin ("Зарплаты"). Additive.
CREATE TABLE IF NOT EXISTS payroll_employees (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id UUID NULL,
  user_id UUID NULL,
  name VARCHAR(120) NOT NULL,
  role_title VARCHAR(120) NOT NULL DEFAULT '',
  amount_cents INT4 NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  method_note VARCHAR(300) NOT NULL DEFAULT '',
  email VARCHAR(254) NULL,
  stripe_account_id VARCHAR(64) NULL,
  stripe_payouts_enabled BOOL NOT NULL DEFAULT false,
  active BOOL NOT NULL DEFAULT true,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_employees_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS payroll_employees_active_name_idx ON payroll_employees (active, name);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_employees_user_id_key ON payroll_employees (user_id);

CREATE TABLE IF NOT EXISTS payroll_payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  period VARCHAR(40) NOT NULL,
  amount_cents INT4 NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  method VARCHAR(20) NOT NULL DEFAULT 'manual',
  status VARCHAR(16) NOT NULL DEFAULT 'paid',
  base_cents INT4 NOT NULL DEFAULT 0,
  commission_cents INT4 NOT NULL DEFAULT 0,
  fee_cents INT4 NOT NULL DEFAULT 0,
  net_cents INT4 NOT NULL DEFAULT 0,
  transfer_id VARCHAR(64) NULL,
  failure VARCHAR(300) NULL,
  note VARCHAR(300) NULL,
  cancel_reason VARCHAR(500) NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ NULL,
  CONSTRAINT payroll_payouts_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_payouts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES payroll_employees (id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS payroll_payouts_employee_id_created_at_idx ON payroll_payouts (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_payouts_period_created_at_idx ON payroll_payouts (period, created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_payouts_batch_id_idx ON payroll_payouts (batch_id);

CREATE TABLE IF NOT EXISTS payroll_accruals (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  source VARCHAR(24) NOT NULL,
  kind VARCHAR(24) NOT NULL DEFAULT 'commission',
  event_ref VARCHAR(120) NOT NULL,
  amount_cents INT4 NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  period VARCHAR(40) NOT NULL,
  note VARCHAR(300) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  payout_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ NULL,
  canceled_at TIMESTAMPTZ NULL,
  CONSTRAINT payroll_accruals_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_accruals_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES payroll_employees (id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_accruals_event_ref_key ON payroll_accruals (event_ref);
CREATE INDEX IF NOT EXISTS payroll_accruals_employee_id_status_idx ON payroll_accruals (employee_id, status);
CREATE INDEX IF NOT EXISTS payroll_accruals_payout_id_idx ON payroll_accruals (payout_id);

-- Stripe's payout cost is taken from the person's payout (owner
-- 2026-10-05); the owner can change these in Настройки.
INSERT INTO app_config (key, value, updated_at) VALUES
  ('payroll.stripe_fee_percent', '0.25'::JSONB, now()),
  ('payroll.stripe_fee_fixed_cents', '25'::JSONB, now()),
  ('payroll.stripe_monthly_fee_cents', '200'::JSONB, now())
ON CONFLICT (key) DO NOTHING;

-- Stripe Connect payouts stay off until the owner turns this on (data only).
INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('payroll_stripe_payouts', false, 100, 'Salaries paid out through Stripe Connect (employees link a bank account or card)', now())
ON CONFLICT (key) DO NOTHING;
