-- Owner 2026-10-05: demo world for bloggers («Продвижение») + partners
-- without an app account. Demo data itself lives in a separate database
-- (<db>_demo) that replays these same migrations; this table is the
-- registry in the real database.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "placeholder_kind" STRING(24);

ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "external_name" STRING(120);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "external_contact" STRING(200);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "demo_access" BOOL NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "demo_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demo_user_id" UUID NOT NULL,
    "role" STRING(16) NOT NULL,
    "display_name" STRING(120) NOT NULL,
    "label" STRING(200),
    "created_by_user_id" UUID,
    "created_by_admin_id" UUID,
    "invite_code_hash" STRING(64),
    "invite_expires_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "demo_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "demo_accounts_demo_user_id_key" ON "demo_accounts"("demo_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "demo_accounts_invite_code_hash_key" ON "demo_accounts"("invite_code_hash");
CREATE INDEX IF NOT EXISTS "demo_accounts_created_by_user_id_created_at_idx" ON "demo_accounts"("created_by_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "demo_accounts_last_seen_at_idx" ON "demo_accounts"("last_seen_at");
