SET LOCAL lock_timeout = '5s';
-- Firms audit 16.11 (PR-4): check the link added NOT VALID in
-- 20261130130000_bid_participants (the new table is empty; no long lock on
-- bids either way).
ALTER TABLE "bid_participants" VALIDATE CONSTRAINT "bid_participants_bid_id_fkey";
