-- Owner 2026-10-05: a client offers one of their open cases to a chosen
-- attorney; the attorney answers with a bid or declines.
CREATE TABLE IF NOT EXISTS case_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attorney_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status STRING(20) NOT NULL DEFAULT 'pending',
  message STRING(1000),
  budget_cents INT4,
  decline_reason STRING(500),
  outside_practice BOOL NOT NULL DEFAULT false,
  outside_licensed_states BOOL NOT NULL DEFAULT false,
  bid_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT case_invites_case_attorney_key UNIQUE (case_id, attorney_id)
);
CREATE INDEX IF NOT EXISTS case_invites_attorney_status_idx
  ON case_invites (attorney_id, status);
CREATE INDEX IF NOT EXISTS case_invites_client_created_idx
  ON case_invites (client_id, created_at);
