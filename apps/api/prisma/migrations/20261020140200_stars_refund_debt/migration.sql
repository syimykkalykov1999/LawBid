-- A refunded stars top-up takes the stars back; what was already spent
-- becomes a debt (the balance never goes below 0).
ALTER TABLE "star_wallets" ADD COLUMN "debt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "star_wallets" ADD CONSTRAINT "star_wallets_debt_check" CHECK ("debt" >= 0);
ALTER TABLE "star_purchases" ADD COLUMN "refunded_at" TIMESTAMPTZ;
