-- docs/06 stage 6.12 (load review): indexes behind the file-06 background
-- jobs — ops counters, anonymization scan and message scrub, the daily
-- journal chain check, the hourly bid-lapse job.
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "users_status_deletion_requested_at_idx" ON "users"("status", "deletion_requested_at");
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");
CREATE INDEX "case_journal_created_at_idx" ON "case_journal"("created_at");
CREATE INDEX "bids_status_idx" ON "bids"("status");
