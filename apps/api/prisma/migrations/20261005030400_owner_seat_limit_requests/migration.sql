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

-- Owner 2026-10-05: the assistant limit is an admin setting (default 10)
-- with personal overrides, so the old "at most 6" checks become the hard
-- cap of 50 (SEATS_HARD_CAP in billing.constants.ts).
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_assistant_seats_range";
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_assistant_seats_range" CHECK ("assistant_seats" BETWEEN 0 AND 50);
ALTER TABLE "contract_grants" DROP CONSTRAINT "contract_grants_seats_check";
ALTER TABLE "contract_grants" ADD CONSTRAINT "contract_grants_seats_check" CHECK ("assistant_seats" BETWEEN 0 AND 50);
