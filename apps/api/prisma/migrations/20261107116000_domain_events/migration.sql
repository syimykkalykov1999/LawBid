-- Events pipeline (N-2): append-only domain event stream, 30-day retention.
CREATE TABLE "domain_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "actor_user_id" UUID,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "published_at" TIMESTAMPTZ,
    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "domain_events_idempotency_key_key" ON "domain_events"("idempotency_key");
CREATE INDEX "domain_events_occurred_at_idx" ON "domain_events"("occurred_at");
CREATE INDEX "domain_events_type_occurred_at_idx" ON "domain_events"("type", "occurred_at");
-- Rows waiting for the stream sink (normally none).
CREATE INDEX "domain_events_unpublished_idx" ON "domain_events"("occurred_at") WHERE "published_at" IS NULL;
