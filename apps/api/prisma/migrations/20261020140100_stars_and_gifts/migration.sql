-- Owner 2026-10-20: stars (balance + ledger + web purchases), the gift catalog,
-- gifts given, a price on sticker packs. The enum value 'gift' is in the
-- previous migration.
-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "gift_send_id" UUID;

-- AlterTable
ALTER TABLE "sticker_packs" ADD COLUMN     "price_stars" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "star_wallets" (
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime_bought" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "star_wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "star_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "ref_id" UUID,
    "note" VARCHAR(120),
    "idem_key" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "star_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "star_purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "pack_id" VARCHAR(40) NOT NULL,
    "stars" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending_payment',
    "stripe_checkout_id" TEXT,
    "payment_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ,

    CONSTRAINT "star_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(64) NOT NULL,
    "price_stars" INTEGER NOT NULL,
    "file_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(12) NOT NULL DEFAULT 'active',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_sends" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gift_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "conversation_id" UUID,
    "price_stars" INTEGER NOT NULL,
    "note" VARCHAR(200),
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "shown" BOOLEAN NOT NULL DEFAULT true,
    "converted_stars" INTEGER,
    "converted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "star_ledger_idem_key_key" ON "star_ledger"("idem_key");

-- CreateIndex
CREATE INDEX "star_ledger_user_id_created_at_idx" ON "star_ledger"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "star_ledger_kind_created_at_idx" ON "star_ledger"("kind", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "star_purchases_stripe_checkout_id_key" ON "star_purchases"("stripe_checkout_id");

-- CreateIndex
CREATE INDEX "star_purchases_user_id_created_at_idx" ON "star_purchases"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "star_purchases_status_paid_at_idx" ON "star_purchases"("status", "paid_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gifts_file_id_key" ON "gifts"("file_id");

-- CreateIndex
CREATE INDEX "gifts_catalog_idx" ON "gifts"("status", "position");

-- CreateIndex
CREATE INDEX "gift_sends_recipient_id_created_at_idx" ON "gift_sends"("recipient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "gift_sends_sender_id_created_at_idx" ON "gift_sends"("sender_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_gift_send_id_idx" ON "messages"("gift_send_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_gift_send_fkey" FOREIGN KEY ("gift_send_id") REFERENCES "gift_sends"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_file_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gift_sends" ADD CONSTRAINT "gift_sends_gift_fkey" FOREIGN KEY ("gift_id") REFERENCES "gifts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- The balance never goes below zero; a price is never negative.
ALTER TABLE "star_wallets" ADD CONSTRAINT "star_wallets_balance_check" CHECK ("balance" >= 0);
ALTER TABLE "sticker_packs" ADD CONSTRAINT "sticker_packs_price_stars_check" CHECK ("price_stars" >= 0);
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_price_stars_check" CHECK ("price_stars" >= 1);
ALTER TABLE "gift_sends" ADD CONSTRAINT "gift_sends_price_stars_check" CHECK ("price_stars" >= 1);
