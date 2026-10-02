-- Paid verified badge of a client (Owner 2026-10-02).
CREATE TABLE IF NOT EXISTS client_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  document_file_ids JSONB NOT NULL DEFAULT '[]',
  note VARCHAR(500),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  reject_reason VARCHAR(500),
  revoke_reason VARCHAR(500),
  stripe_checkout_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  sub_status VARCHAR(16) NOT NULL DEFAULT 'none',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOL NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_verifications_pkey PRIMARY KEY (id),
  CONSTRAINT client_verifications_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX IF NOT EXISTS client_verifications_user_id_key ON client_verifications (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_verifications_stripe_subscription_id_key ON client_verifications (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS client_verifications_queue_idx ON client_verifications (status, submitted_at DESC);
