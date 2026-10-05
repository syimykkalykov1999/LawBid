-- Owner 2026-10-05 (docs/CLIENT_FRAUD.md): a blocked fraudster must not
-- come back with the same phone, e-mail, Apple / Google account, card or
-- device. Hashed identity signals per account, the client risk score and
-- an append-only decision history.
CREATE TABLE "identity_fingerprints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "kind" STRING(16) NOT NULL,
  "hash" STRING(64) NOT NULL,
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "banned_at" TIMESTAMPTZ,
  CONSTRAINT "identity_fingerprints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "identity_fingerprints_user_id_kind_hash_key" ON "identity_fingerprints"("user_id", "kind", "hash");
CREATE INDEX "identity_fingerprints_kind_hash_idx" ON "identity_fingerprints"("kind", "hash");
CREATE INDEX "identity_fingerprints_last_seen_at_idx" ON "identity_fingerprints"("last_seen_at");

CREATE TABLE "client_fraud_profiles" (
  "user_id" UUID NOT NULL,
  "score" INT4 NOT NULL DEFAULT 0,
  "status" STRING(16) NOT NULL DEFAULT 'ok',
  "signals" JSONB NOT NULL DEFAULT '[]',
  "linked_user_id" UUID,
  "queue_reason" STRING(16),
  "queued_at" TIMESTAMPTZ,
  "cleared_score" INT4,
  "cleared_by" UUID,
  "cleared_at" TIMESTAMPTZ,
  "computed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "client_fraud_profiles_pkey" PRIMARY KEY ("user_id")
);
CREATE INDEX "client_fraud_profiles_status_score_idx" ON "client_fraud_profiles"("status", "score" DESC);

CREATE TABLE "client_fraud_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "kind" STRING(32) NOT NULL,
  "actor_type" STRING(16) NOT NULL DEFAULT 'system',
  "actor_id" UUID,
  "note" STRING(500),
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "client_fraud_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_fraud_events_user_id_created_at_idx" ON "client_fraud_events"("user_id", "created_at" DESC);
CREATE INDEX "client_fraud_events_kind_created_at_idx" ON "client_fraud_events"("kind", "created_at" DESC);
CREATE INDEX "client_fraud_events_actor_id_created_at_idx" ON "client_fraud_events"("actor_id", "created_at" DESC);
