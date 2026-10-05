-- Owner 2026-10-05: partner (affiliate) program — people paid per referred
-- attorney who buys a subscription / client who hires, plus an optional
-- monthly base. Attribution reuses referral_codes / referrals.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_commission';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_payout';

CREATE TABLE IF NOT EXISTS partners (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status STRING(16) NOT NULL DEFAULT 'active',
  label STRING(120),
  note STRING(1000),
  attorney_rate_cents INT4,
  client_rate_cents INT4,
  monthly_base_cents INT4 NOT NULL DEFAULT 0,
  client_rule STRING(24),
  hold_days INT2,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  CONSTRAINT partners_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS partners_user_id_key ON partners (user_id);
CREATE INDEX IF NOT EXISTS partners_status_created_at_idx ON partners (status, created_at);

CREATE TABLE IF NOT EXISTS partner_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL,
  partner_user_id UUID NOT NULL,
  referral_id UUID,
  referred_user_id UUID,
  kind STRING(32) NOT NULL,
  amount_cents INT4 NOT NULL,
  status STRING(16) NOT NULL DEFAULT 'held',
  event_ref STRING(120) NOT NULL,
  period STRING(7) NOT NULL,
  hold_until TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  payout_ref STRING(120),
  reversed_at TIMESTAMPTZ,
  reversed_reason STRING(300),
  note STRING(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT partner_commissions_pkey PRIMARY KEY (id),
  CONSTRAINT partner_commissions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES partners (id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_event_ref_key ON partner_commissions (event_ref);
CREATE INDEX IF NOT EXISTS partner_commissions_partner_id_created_at_idx ON partner_commissions (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_commissions_status_hold_until_idx ON partner_commissions (status, hold_until);
CREATE INDEX IF NOT EXISTS partner_commissions_referred_user_id_idx ON partner_commissions (referred_user_id);
CREATE INDEX IF NOT EXISTS partner_commissions_period_status_idx ON partner_commissions (period, status);
