SET LOCAL lock_timeout = '5s';
-- Owner row 87 (hotline plan PR 6–7, mockup 18.11): what the screens add to
-- a hotline call — the client's topic (for «Дело из звонка» after the
-- request leaves Valkey), the case offered from the call («Предложить дело»,
-- one per call) and the client's review («Как прошёл разговор?», stars and
-- an optional comment ≤ 300). Expand-only: new nullable columns, no
-- default rewrite, no index.
ALTER TABLE "hotline_calls"
    ADD COLUMN "topic" VARCHAR(200),
    ADD COLUMN "case_id" UUID,
    ADD COLUMN "case_invite_id" UUID,
    ADD COLUMN "review_stars" SMALLINT,
    ADD COLUMN "review_comment" VARCHAR(300),
    ADD COLUMN "reviewed_at" TIMESTAMPTZ;
ALTER TABLE "hotline_calls"
    ADD CONSTRAINT "hotline_calls_review_stars_check"
    CHECK ("review_stars" IS NULL OR "review_stars" BETWEEN 1 AND 5) NOT VALID;
