-- Owner 2026-10-01: anyone reviews anyone. An attorney review no longer
-- needs a case (case_id NULL = an open review, one per author); the case
-- ones stay "verified by a case". Open reviews can be appealed like client
-- reviews: an admin decides, undecided after 30 days -> removed.
ALTER TABLE reviews ALTER COLUMN case_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_open_author_uq
  ON reviews (client_id, attorney_id)
  WHERE case_id IS NULL AND status <> 'removed';

CREATE TABLE IF NOT EXISTS review_appeals (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL,
  appellant_id UUID NOT NULL,
  reason STRING NOT NULL,
  status review_appeal_status NOT NULL DEFAULT 'pending',
  auto_remove_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ NULL,
  decided_by UUID NULL,
  admin_note STRING NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_appeals_pkey PRIMARY KEY (id),
  CONSTRAINT review_appeals_review_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT review_appeals_appellant_fkey FOREIGN KEY (appellant_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT review_appeals_reason_len CHECK (length(reason) BETWEEN 1 AND 1000),
  UNIQUE INDEX review_appeals_review_key (review_id),
  INDEX review_appeals_status_created_idx (status, created_at),
  INDEX review_appeals_status_auto_idx (status, auto_remove_at)
);
