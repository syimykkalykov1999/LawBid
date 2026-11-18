-- Verify 17.11, batch 6 (A4): one assistant works in one attorney team.
-- assistants.service assertCanJoin read "no active team" and the claim
-- (activate / AssistantCodeService.claim) wrote later, so two invites or
-- codes accepted at the same moment made the same account active in two
-- teams. The unique key turns the loser into P2002, answered as the
-- existing 409 ASSISTANT_PHONE_TAKEN. Partial on the live status (removed
-- and invited seats keep their history) and out of Prisma's schema diff
-- like the other concurrent indexes; NULL ids (invites nobody accepted)
-- never collide.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS assistant_memberships_one_active_key
  ON assistant_memberships (assistant_user_id)
  WHERE status = 'active';
