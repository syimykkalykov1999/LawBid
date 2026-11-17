SET LOCAL lock_timeout = '5s';
-- Firms audit 16.11 (PR-1, rest of row 167): the bid records who really sent
-- it (the attorney, or the firm owner sending as a member), and the member
-- gets a `firm_update` notification. Only additions: old builds never read
-- the column; bids sent before it keep NULL.
ALTER TABLE "bids" ADD COLUMN "sent_by" UUID;
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'firm_update';
