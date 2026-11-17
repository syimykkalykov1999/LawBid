SET LOCAL lock_timeout = '5s';
-- Firms audit 16.11 (PR-2): a firm's owner and members are real users. The
-- links are added NOT VALID here (no scan under the write lock) and checked
-- in 20261130110100_firm_owner_links_validate. An owner can never be
-- removed from under a firm (RESTRICT: the erasure hands the firm over
-- first); a member row goes with its user (CASCADE). Expand-only: the
-- running release writes only real user ids into both columns.
ALTER TABLE "firms" ADD CONSTRAINT "firms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "firm_members" ADD CONSTRAINT "firm_members_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
