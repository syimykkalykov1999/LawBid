-- Owner 2026-10-17: percent (contingency) budgets and bids. Enum values in
-- their own migration: a new value cannot be used in the transaction that
-- adds it.
ALTER TYPE "budget_mode" ADD VALUE IF NOT EXISTS 'percent';
ALTER TYPE "fee_type" ADD VALUE IF NOT EXISTS 'contingency';
