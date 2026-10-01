-- Owner 2026-10-01: reviews exactly like Google Maps — the author edits /
-- deletes any time; the reviewed person can't delete, they reply publicly;
-- anyone flags a review (policy categories) to moderation; "Helpful".
DROP TABLE IF EXISTS review_appeals;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply STRING(1000) NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_count INT4 NOT NULL DEFAULT 0;
ALTER TABLE client_reviews ADD COLUMN IF NOT EXISTS reply STRING(1000) NULL;
ALTER TABLE client_reviews ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ NULL;
ALTER TABLE client_reviews ADD COLUMN IF NOT EXISTS helpful_count INT4 NOT NULL DEFAULT 0;
ALTER TABLE client_reviews ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS review_helpful_votes (
  review_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_helpful_votes_pkey PRIMARY KEY (review_id, user_id),
  CONSTRAINT review_helpful_votes_review_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT review_helpful_votes_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS client_review_helpful_votes (
  review_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_review_helpful_votes_pkey PRIMARY KEY (review_id, user_id),
  CONSTRAINT client_review_helpful_votes_review_fkey FOREIGN KEY (review_id) REFERENCES client_reviews(id) ON DELETE CASCADE,
  CONSTRAINT client_review_helpful_votes_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
