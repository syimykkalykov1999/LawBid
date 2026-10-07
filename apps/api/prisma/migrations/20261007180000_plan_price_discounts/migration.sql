-- Owner 2026-10-07: strikethrough "old price" per plan price (additive).
-- Shown only while show_discount is on AND compare_at_cents > amount_cents,
-- so raising the price later never turns the discount into a "plus".
ALTER TABLE plan_prices ADD COLUMN IF NOT EXISTS compare_at_cents INT4;
ALTER TABLE plan_prices ADD COLUMN IF NOT EXISTS show_discount BOOL NOT NULL DEFAULT false;
