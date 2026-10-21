-- Owner 2026-10-20: the deadline calculator is off by default (legal risk).
-- Databases seeded earlier hold the flag ON; switch it off. The owner can
-- turn it on again in the admin («Функции»).
UPDATE "feature_flags" SET "enabled" = false WHERE "key" = 'deadline_calculator';
