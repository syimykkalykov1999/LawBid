-- Owner 2026-10-05: a personal assistant limit per attorney, and the
-- attorney's requests for more seats that an admin approves.
ALTER TABLE attorney_profiles ADD COLUMN IF NOT EXISTS assistant_seat_limit INT2;

CREATE TABLE IF NOT EXISTS seat_limit_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attorney_id UUID NOT NULL,
  requested_seats INT2 NOT NULL,
  note STRING(1000),
  status STRING(20) NOT NULL DEFAULT 'pending',
  granted_seats INT2,
  decision_note STRING(500),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seat_limit_requests_status_created_idx
  ON seat_limit_requests (status, created_at);
CREATE INDEX IF NOT EXISTS seat_limit_requests_attorney_created_idx
  ON seat_limit_requests (attorney_id, created_at);
