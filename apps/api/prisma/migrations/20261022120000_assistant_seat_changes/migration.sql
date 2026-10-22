-- Owner 2026-10-22: a bought assistant seat is charged at once (the
-- prorated rest of the period) and a removed one stays until the period
-- end. Every change is recorded here (admin «Покупки мест»; a decrease
-- waiting for the period end).
CREATE TYPE "assistant_seat_change_status" AS ENUM ('pending', 'paid', 'failed', 'expired', 'scheduled', 'applied', 'canceled');

CREATE TABLE "assistant_seat_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "from_seats" SMALLINT NOT NULL,
    "to_seats" SMALLINT NOT NULL,
    "stripe_invoice_id" TEXT,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "status" "assistant_seat_change_status" NOT NULL,
    "effective_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assistant_seat_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_seat_changes_by_user" ON "assistant_seat_changes"("user_id", "created_at" DESC);
CREATE INDEX "assistant_seat_changes_by_invoice" ON "assistant_seat_changes"("stripe_invoice_id");
CREATE INDEX "assistant_seat_changes_recent" ON "assistant_seat_changes"("created_at" DESC);

ALTER TABLE "assistant_seat_changes" ADD CONSTRAINT "assistant_seat_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
