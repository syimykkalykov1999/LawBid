SET LOCAL lock_timeout = '5s';
-- Firms audit 16.11 (PR-3): invitations get their own table. A lawyer may
-- hold several (one per firm), none blocks creating or joining another firm,
-- and each is valid until `expires_at` (setting `firms.invite_expiry_days`,
-- 7 by default). Expand-only: the legacy `firm_members` rows with status
-- `invited` are copied (valid 7 days from now) and left in place, so the
-- running release keeps reading them; the new code ignores them.

-- CreateTable
CREATE TABLE "firm_invitations" (
    "firm_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "firm_invitations_pkey" PRIMARY KEY ("firm_id","attorney_id")
);

-- CreateIndex
CREATE INDEX "firm_invitations_attorney_id_expires_at_idx" ON "firm_invitations"("attorney_id", "expires_at");

-- CreateIndex
CREATE INDEX "firm_invitations_invited_by_idx" ON "firm_invitations"("invited_by");

-- AddForeignKey
ALTER TABLE "firm_invitations" ADD CONSTRAINT "firm_invitations_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_invitations" ADD CONSTRAINT "firm_invitations_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_invitations" ADD CONSTRAINT "firm_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy the legacy invitations (firm_members is tiny: one row per firm
-- lawyer; the firm's owner is the inviter).
INSERT INTO "firm_invitations" ("firm_id", "attorney_id", "invited_by", "created_at", "expires_at")
SELECT m."firm_id", m."attorney_id", f."owner_id", m."created_at", now() + interval '7 days'
FROM "firm_members" m
JOIN "firms" f ON f."id" = m."firm_id"
WHERE m."status" = 'invited'
ON CONFLICT DO NOTHING;
