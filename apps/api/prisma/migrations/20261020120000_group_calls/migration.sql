-- Owner 2026-10-20: group calls (add people to a running call, mute / remove
-- from the host, join and leave at will). The two original members stay in
-- calls.caller_id / callee_id; every group member also has a row here.
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "is_group" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "call_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "call_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "invited_by_id" UUID,
  "status" VARCHAR(12) NOT NULL DEFAULT 'invited',
  "muted" BOOLEAN NOT NULL DEFAULT false,
  "muted_by_host" BOOLEAN NOT NULL DEFAULT false,
  "invited_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joined_at" TIMESTAMPTZ,
  "left_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "call_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "call_participants_status_check"
    CHECK ("status" IN ('invited', 'joined', 'declined', 'left', 'removed')),
  CONSTRAINT "call_participants_call_id_fkey" FOREIGN KEY ("call_id")
    REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "call_participants_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "call_participants_invited_by_id_fkey" FOREIGN KEY ("invited_by_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "call_participants_call_id_user_id_key"
  ON "call_participants" ("call_id", "user_id");
CREATE INDEX IF NOT EXISTS "call_participants_user_id_status_idx"
  ON "call_participants" ("user_id", "status");
