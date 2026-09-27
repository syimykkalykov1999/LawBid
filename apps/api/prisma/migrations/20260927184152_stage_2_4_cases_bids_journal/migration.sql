-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "title" STRING NOT NULL,
    "description" STRING NOT NULL,
    "practice_area_id" UUID NOT NULL,
    "primary_state_code" CHAR(2) NOT NULL,
    "city" STRING,
    "budget_mode" "budget_mode" NOT NULL,
    "budget_cents" INT4,
    "status" "case_status" NOT NULL DEFAULT 'open',
    "accepted_bid_id" UUID,
    "view_count" INT4 NOT NULL DEFAULT 0,
    "bids_count" INT4 NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale_prompt_sent_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "client_completed_at" TIMESTAMPTZ,
    "attorney_confirmed_at" TIMESTAMPTZ,
    "auto_close_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_states" (
    "case_id" UUID NOT NULL,
    "state_code" CHAR(2) NOT NULL,
    "is_primary" BOOL NOT NULL DEFAULT false,

    CONSTRAINT "case_states_pkey" PRIMARY KEY ("case_id","state_code")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "status" "bid_status" NOT NULL DEFAULT 'active',
    "fee_type" "fee_type" NOT NULL,
    "amount_cents" INT4 NOT NULL,
    "message" STRING NOT NULL,
    "start_availability" "start_availability" NOT NULL,
    "start_date" DATE,
    "estimated_duration_days" INT4,
    "round_count" INT2 NOT NULL DEFAULT 0,
    "turn" "party_role" NOT NULL,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bid_id" UUID NOT NULL,
    "round_no" INT2 NOT NULL,
    "from_role" "party_role" NOT NULL,
    "fee_type" "fee_type" NOT NULL,
    "amount_cents" INT4 NOT NULL,
    "message" STRING,
    "status" "offer_status" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_journal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" "user_role",
    "event_type" "case_journal_event" NOT NULL,
    "payload" JSONB NOT NULL,
    "prev_hash" STRING,
    "row_hash" STRING NOT NULL,
    "retain_until" TIMESTAMPTZ NOT NULL DEFAULT now() + '5 years'::INTERVAL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_disclosures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "bid_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "fields" STRING[],
    "ip" STRING,
    "device_id" STRING,
    "disclosed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_disclosures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_issue_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "bid_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "issue_type" "contact_issue_type" NOT NULL,
    "note" STRING,
    "status" "contact_issue_status" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contact_issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "reason" STRING NOT NULL,
    "status" "dispute_status" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "case_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "rating" INT2 NOT NULL,
    "body" STRING,
    "status" "review_status" NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cases_accepted_bid_id_key" ON "cases"("accepted_bid_id");

-- CreateIndex
CREATE INDEX "cases_client_id_status_created_at_idx" ON "cases"("client_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cases_primary_state_code_practice_area_id_created_at_idx" ON "cases"("primary_state_code", "practice_area_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "case_states_state_code_case_id_idx" ON "case_states"("state_code", "case_id");

-- CreateIndex
CREATE INDEX "bids_case_id_status_idx" ON "bids"("case_id", "status");

-- CreateIndex
CREATE INDEX "bids_attorney_id_status_updated_at_idx" ON "bids"("attorney_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bids_case_id_attorney_id_key" ON "bids"("case_id", "attorney_id");

-- CreateIndex
CREATE UNIQUE INDEX "bid_offers_bid_id_round_no_key" ON "bid_offers"("bid_id", "round_no");

-- CreateIndex
CREATE INDEX "case_journal_case_id_created_at_idx" ON "case_journal"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "case_journal_client_id_created_at_idx" ON "case_journal"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "case_journal_retain_until_idx" ON "case_journal"("retain_until");

-- CreateIndex
CREATE UNIQUE INDEX "contact_disclosures_bid_id_key" ON "contact_disclosures"("bid_id");

-- CreateIndex
CREATE INDEX "contact_issue_reports_status_created_at_idx" ON "contact_issue_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "case_disputes_case_id_idx" ON "case_disputes"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_case_id_key" ON "reviews"("case_id");

-- CreateIndex
CREATE INDEX "reviews_attorney_id_created_at_idx" ON "reviews"("attorney_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_primary_state_code_fkey" FOREIGN KEY ("primary_state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_accepted_bid_id_fkey" FOREIGN KEY ("accepted_bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_states" ADD CONSTRAINT "case_states_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_states" ADD CONSTRAINT "case_states_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_offers" ADD CONSTRAINT "bid_offers_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_journal" ADD CONSTRAINT "case_journal_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_journal" ADD CONSTRAINT "case_journal_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_journal" ADD CONSTRAINT "case_journal_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_disclosures" ADD CONSTRAINT "contact_disclosures_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_disclosures" ADD CONSTRAINT "contact_disclosures_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_disclosures" ADD CONSTRAINT "contact_disclosures_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_disclosures" ADD CONSTRAINT "contact_disclosures_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_issue_reports" ADD CONSTRAINT "contact_issue_reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_issue_reports" ADD CONSTRAINT "contact_issue_reports_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_issue_reports" ADD CONSTRAINT "contact_issue_reports_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_issue_reports" ADD CONSTRAINT "contact_issue_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_issue_reports" ADD CONSTRAINT "contact_issue_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_disputes" ADD CONSTRAINT "case_disputes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_disputes" ADD CONSTRAINT "case_disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_disputes" ADD CONSTRAINT "case_disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- docs/02_DATABASE.md §6.1 CHECK constraints (stage 2.4).
ALTER TABLE "bids" ADD CONSTRAINT "bids_round_count_ck" CHECK ("round_count" BETWEEN 0 AND 5);
ALTER TABLE "bids" ADD CONSTRAINT "bids_amount_cents_ck" CHECK ("amount_cents" >= 0);
ALTER TABLE "bids" ADD CONSTRAINT "bids_message_len" CHECK (char_length("message") <= 2000);
ALTER TABLE "bid_offers" ADD CONSTRAINT "bid_offers_amount_cents_ck" CHECK ("amount_cents" >= 0);
ALTER TABLE "bid_offers" ADD CONSTRAINT "bid_offers_round_no_ck" CHECK ("round_no" BETWEEN 0 AND 5);
ALTER TABLE "cases" ADD CONSTRAINT "cases_budget_cents_ck" CHECK ("budget_cents" >= 0);
ALTER TABLE "cases" ADD CONSTRAINT "cases_budget_mode_ck" CHECK (("budget_mode" = 'amount') = ("budget_cents" IS NOT NULL));
ALTER TABLE "cases" ADD CONSTRAINT "cases_title_len" CHECK (char_length("title") <= 120);
ALTER TABLE "cases" ADD CONSTRAINT "cases_description_len" CHECK (char_length("description") <= 5000);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_ck" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_body_len" CHECK (char_length("body") <= 1000);
