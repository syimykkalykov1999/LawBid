-- Double-entry money ledger (docs/architecture/MONEY_LEDGER.md). Expand-only: new tables.

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('asset', 'liability', 'revenue', 'expense', 'external');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "owner_key" VARCHAR(40) NOT NULL DEFAULT 'platform',
    "owner_id" UUID,
    "currency" VARCHAR(3) NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "party_shard" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_type" VARCHAR(40) NOT NULL,
    "source_id" VARCHAR(80) NOT NULL,
    "event" VARCHAR(40) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "stripe_ref" VARCHAR(80),
    "party_shard" SMALLINT NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_accounts_owner_id_idx" ON "ledger_accounts"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_owner_key_currency_key" ON "ledger_accounts"("code", "owner_key", "currency");

-- CreateIndex
CREATE INDEX "ledger_entries_occurred_at_idx" ON "ledger_entries"("occurred_at");

-- CreateIndex
CREATE INDEX "ledger_entries_stripe_ref_idx" ON "ledger_entries"("stripe_ref");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_source_type_source_id_event_key" ON "ledger_entries"("source_type", "source_id", "event");

-- CreateIndex
CREATE INDEX "ledger_lines_entry_id_idx" ON "ledger_lines"("entry_id");

-- CreateIndex
CREATE INDEX "ledger_lines_account_id_created_at_idx" ON "ledger_lines"("account_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integer cents, strictly positive; ISO-4217 style lower-case code.
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_currency_format" CHECK ("currency" ~ '^[a-z]{3}$');
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_currency_format" CHECK ("currency" ~ '^[a-z]{3}$');

-- Append-only: no UPDATE, no DELETE. A correction is a new reversing entry.
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are append-only (% on %); post a reversing entry instead', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER ledger_accounts_append_only BEFORE UPDATE OR DELETE ON "ledger_accounts"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_lines_append_only BEFORE UPDATE OR DELETE ON "ledger_lines"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- Every entry balances to zero: checked once per entry at COMMIT (deferred), so
-- the lines of one entry can be inserted in any order inside the transaction.
-- Also: at least two lines, and each line's account has the entry's currency.
CREATE FUNCTION ledger_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  eid uuid;
  d bigint;
  c bigint;
  n integer;
  bad integer;
BEGIN
  IF TG_TABLE_NAME = 'ledger_entries' THEN eid := NEW.id; ELSE eid := NEW.entry_id; END IF;
  SELECT COALESCE(SUM("amount_cents") FILTER (WHERE "direction" = 'debit'), 0),
         COALESCE(SUM("amount_cents") FILTER (WHERE "direction" = 'credit'), 0),
         COUNT(*)
    INTO d, c, n
    FROM "ledger_lines" WHERE "entry_id" = eid;
  IF n < 2 OR d <> c THEN
    RAISE EXCEPTION 'ledger entry % does not balance (debit %, credit %, lines %)', eid, d, c, n
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COUNT(*) INTO bad
    FROM "ledger_lines" l
    JOIN "ledger_accounts" a ON a."id" = l."account_id"
    JOIN "ledger_entries" e ON e."id" = l."entry_id"
   WHERE l."entry_id" = eid AND a."currency" <> e."currency";
  IF bad > 0 THEN
    RAISE EXCEPTION 'ledger entry % mixes currencies', eid USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_lines_balanced AFTER INSERT ON "ledger_lines"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_entry_balanced();
CREATE CONSTRAINT TRIGGER ledger_entries_has_lines AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_entry_balanced();
