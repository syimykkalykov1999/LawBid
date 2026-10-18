-- Owner 2026-10-17: iPhone PushKit (VoIP) tokens for incoming calls.
CREATE TABLE "voip_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "voip_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voip_tokens_environment_ck" CHECK ("environment" IN ('sandbox', 'production'))
);
CREATE UNIQUE INDEX "voip_tokens_token_key" ON "voip_tokens"("token");
CREATE INDEX "voip_tokens_user_id_idx" ON "voip_tokens"("user_id");
ALTER TABLE "voip_tokens" ADD CONSTRAINT "voip_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voip_tokens" ADD CONSTRAINT "voip_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
