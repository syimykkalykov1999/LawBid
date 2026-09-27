-- docs/01_FOUNDATION_AUTH.md §10.6 / docs/02_DATABASE.md §6.4 (p12 leaf 1.1):
-- SessionService.isNewDevice() runs, on every login,
--   SELECT id FROM sessions WHERE user_id = $1 AND device_id = $2 LIMIT 1
-- Without this index that is a FULL SCAN of sessions: the only user_id
-- index is the partial "revoked_at IS NULL" one (stage 2.6), which cannot
-- answer a lookup that must also see revoked rows. user_id is a random
-- UUID, so this plain index has no write hot-spot (§1.1).
-- CreateIndex
CREATE INDEX "sessions_user_id_device_id_idx" ON "sessions"("user_id", "device_id");
