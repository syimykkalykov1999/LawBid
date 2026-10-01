-- Owner 2026-09-30: admin broadcasts (push + in-app) to an audience.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'admin_broadcast';

CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  title STRING(120) NOT NULL,
  body STRING(1000) NOT NULL,
  audience STRING(20) NOT NULL,
  state_code STRING(2),
  recipients INT8 NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
