-- OQ-048: bid drafts an assistant prepares; only the attorney sends a bid.
CREATE TABLE IF NOT EXISTS bid_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attorney_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  prepared_by_name STRING(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bid_drafts_attorney_case_key UNIQUE (attorney_id, case_id)
);
