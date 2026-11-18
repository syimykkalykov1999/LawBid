-- Verify batch 11 (B1): deleting an admin kept `is_workspace_head`, so the
-- one-head-per-workspace index (admin_profiles_one_head_per_workspace) went
-- on blocking a new head, and the deleted head could not be cleared (the
-- panel no longer lists deleted admins). The service now clears the flag on
-- delete; this clears it for heads deleted before. A handful of rows at most.
SET LOCAL lock_timeout = '5s';
UPDATE "admin_profiles" p
   SET "is_workspace_head" = false
  FROM "users" u
 WHERE u."id" = p."user_id"
   AND u."deleted_at" IS NOT NULL
   AND p."is_workspace_head" = true;
