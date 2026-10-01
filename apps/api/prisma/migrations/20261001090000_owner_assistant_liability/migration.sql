-- OQ-049: an attorney lets assistants bid / negotiate and publish without
-- approval only after accepting full responsibility. Append-only record of
-- each acceptance (and each withdrawal) — evidence of who agreed to what.
CREATE TABLE IF NOT EXISTS assistant_liability_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attorney_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES assistant_memberships(id) ON DELETE CASCADE,
  duties STRING[] NOT NULL,
  granted BOOL NOT NULL,
  terms_version STRING(20) NOT NULL,
  ip STRING(64),
  user_agent STRING(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX assistant_liability_by_attorney (attorney_id, created_at DESC)
);
