-- Typing "div", "divo", "divorce" leaves one row: the person's own earlier
-- prefixes are dropped when the longer query arrives.
ALTER TABLE "search_query_log" ADD COLUMN "user_id" UUID;
CREATE INDEX "search_query_log_user_id_created_at_idx" ON "search_query_log"("user_id", "created_at");
