-- Owner 2026-10-15: search that understands everyday words (synonym groups,
-- a query log for "no results", clicks and the topics learned from them).
CREATE TABLE "search_synonym_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(120) NOT NULL,
    "practice_area_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" VARCHAR(12) NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_synonym_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_synonym_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "lang" VARCHAR(12) NOT NULL,
    "term" VARCHAR(120) NOT NULL,

    CONSTRAINT "search_synonym_terms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_query_log" (
    "id" BIGSERIAL NOT NULL,
    "q" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(12) NOT NULL,
    "lang" VARCHAR(12),
    "results" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_clicks" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "q" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(12) NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "practice_area_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_clicks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_learned_links" (
    "q" VARCHAR(100) NOT NULL,
    "practice_area_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_learned_links_pkey" PRIMARY KEY ("q","practice_area_id")
);

CREATE UNIQUE INDEX "search_synonym_groups_key_key" ON "search_synonym_groups"("key");
CREATE INDEX "search_synonym_groups_practice_area_id_idx" ON "search_synonym_groups"("practice_area_id");
CREATE UNIQUE INDEX "search_synonym_terms_group_id_lang_term_key" ON "search_synonym_terms"("group_id", "lang", "term");
CREATE INDEX "search_synonym_terms_term_idx" ON "search_synonym_terms"("term");
CREATE INDEX "search_query_log_created_at_idx" ON "search_query_log"("created_at");
CREATE INDEX "search_query_log_q_idx" ON "search_query_log"("q");
CREATE INDEX "search_clicks_created_at_idx" ON "search_clicks"("created_at");
CREATE INDEX "search_clicks_q_idx" ON "search_clicks"("q");

ALTER TABLE "search_synonym_groups" ADD CONSTRAINT "search_synonym_groups_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "search_synonym_terms" ADD CONSTRAINT "search_synonym_terms_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "search_synonym_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
