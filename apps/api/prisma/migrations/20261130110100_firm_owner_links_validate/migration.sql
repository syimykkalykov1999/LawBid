SET LOCAL lock_timeout = '5s';
-- Firms audit 16.11 (PR-2): check the links added NOT VALID in
-- 20261130110000_firm_owner_links (SHARE UPDATE EXCLUSIVE, writes go on).
ALTER TABLE "firms" VALIDATE CONSTRAINT "firms_owner_id_fkey";

ALTER TABLE "firm_members" VALIDATE CONSTRAINT "firm_members_attorney_id_fkey";
