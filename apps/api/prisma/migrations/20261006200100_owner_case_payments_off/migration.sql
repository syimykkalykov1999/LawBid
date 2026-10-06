-- Owner 2026-10-06: clients and attorneys settle the agreed fee between
-- themselves; LawBid does not take part. In-app case payments (Stripe
-- Connect) are switched OFF everywhere. The code stays: switch it back on
-- in Admin → Система → Функции (`payments_in_app`).
UPDATE feature_flags SET enabled = false, updated_at = now() WHERE key = 'payments_in_app';
