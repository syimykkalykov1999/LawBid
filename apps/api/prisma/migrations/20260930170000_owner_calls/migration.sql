-- Owner 2026-09-30 (OQ-041): audio calls inside the app (WebRTC), no video.
CREATE TYPE "call_status" AS ENUM ('ringing', 'active', 'ended', 'missed', 'declined', 'busy', 'canceled', 'failed');
ALTER TYPE "message_type" ADD VALUE 'call';
ALTER TYPE "notification_type" ADD VALUE 'missed_call';

CREATE TABLE "calls" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE RESTRICT,
  "caller_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "callee_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" "call_status" NOT NULL DEFAULT 'ringing',
  "answered_at" TIMESTAMPTZ,
  "ended_at" TIMESTAMPTZ,
  "duration_sec" INT4,
  "end_reason" STRING,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "calls_callee_id_status_idx" ON "calls"("callee_id", "status");
CREATE INDEX "calls_caller_id_status_idx" ON "calls"("caller_id", "status");
CREATE INDEX "calls_conversation_id_created_at_idx" ON "calls"("conversation_id", "created_at");
CREATE INDEX "calls_status_created_at_idx" ON "calls"("status", "created_at");
