-- Owner 2026-10-05 07:00 («Борьба с мошенниками»): a rejected or blocked bar
-- number cannot register again under another name or account; staff can
-- unblock with a reason. History is append-only.
CREATE TABLE "bar_number_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "state_code" CHAR(2) NOT NULL,
  "bar_number" STRING NOT NULL,
  "bar_key" STRING NOT NULL,
  "active" BOOL NOT NULL DEFAULT true,
  "reason" STRING(500) NOT NULL,
  "source" STRING(32) NOT NULL,
  "attorney_id" UUID,
  "blocked_by" UUID,
  "blocked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "block_contacts" BOOL NOT NULL DEFAULT false,
  "email_lower" STRING,
  "phone_e164" STRING,
  "unblocked_at" TIMESTAMPTZ,
  "unblocked_by" UUID,
  "unblock_reason" STRING(500),
  "attempts" INT4 NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "bar_number_blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bar_number_blocks_state_code_bar_key_key" ON "bar_number_blocks"("state_code", "bar_key");
CREATE INDEX "bar_number_blocks_active_blocked_at_idx" ON "bar_number_blocks"("active", "blocked_at" DESC);
CREATE INDEX "bar_number_blocks_email_lower_idx" ON "bar_number_blocks"("email_lower");
CREATE INDEX "bar_number_blocks_phone_e164_idx" ON "bar_number_blocks"("phone_e164");

CREATE TABLE "bar_number_block_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "block_id" UUID NOT NULL,
  "kind" STRING(32) NOT NULL,
  "actor_type" STRING(16) NOT NULL DEFAULT 'system',
  "actor_id" UUID,
  "reason" STRING(500),
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "bar_number_block_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bar_number_block_events_block_id_created_at_idx" ON "bar_number_block_events"("block_id", "created_at" DESC);
ALTER TABLE "bar_number_block_events" ADD CONSTRAINT "bar_number_block_events_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "bar_number_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
