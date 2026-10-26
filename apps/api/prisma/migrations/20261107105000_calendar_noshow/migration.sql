-- Owner 2026-10-28: calendar feed + Google/Outlook connectors + consultation no-shows.
ALTER TABLE "consultations" ADD COLUMN "attendance_checked_at" TIMESTAMPTZ;
CREATE INDEX "consultations_status_ends_idx" ON "consultations"("status", "ends_at");

CREATE TABLE "calendar_feed_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_used_at" TIMESTAMPTZ,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "calendar_feed_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "calendar_feed_tokens_user_id_key" ON "calendar_feed_tokens"("user_id");
CREATE UNIQUE INDEX "calendar_feed_tokens_token_hash_key" ON "calendar_feed_tokens"("token_hash");

CREATE TABLE "calendar_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider" VARCHAR(10) NOT NULL,
  "account_email" VARCHAR(254),
  "refresh_token_enc" TEXT NOT NULL,
  "calendar_id" VARCHAR(200) NOT NULL DEFAULT 'primary',
  "read_busy" BOOLEAN NOT NULL DEFAULT true,
  "write_events" BOOLEAN NOT NULL DEFAULT true,
  "status" VARCHAR(12) NOT NULL DEFAULT 'active',
  "last_error" VARCHAR(300),
  "sync_cursor" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_sync_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_connections_provider_check" CHECK ("provider" IN ('google', 'microsoft')),
  CONSTRAINT "calendar_connections_status_check" CHECK ("status" IN ('active', 'needs_reauth'))
);
CREATE UNIQUE INDEX "calendar_connections_user_id_provider_key" ON "calendar_connections"("user_id", "provider");
CREATE INDEX "calendar_connections_provider_status_write_events_idx" ON "calendar_connections"("provider", "status", "write_events");

CREATE TABLE "calendar_event_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "consultation_id" UUID NOT NULL,
  "external_id" VARCHAR(1024) NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "synced_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "calendar_event_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_event_links_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "calendar_event_links_connection_id_consultation_id_key" ON "calendar_event_links"("connection_id", "consultation_id");

CREATE TABLE "consultation_no_shows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "consultation_id" UUID NOT NULL,
  "absent_side" VARCHAR(8) NOT NULL,
  "absent_user_id" UUID NOT NULL,
  "source" VARCHAR(8) NOT NULL,
  "marked_by_id" UUID,
  "state" VARCHAR(12) NOT NULL DEFAULT 'open',
  "marked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "dispute_until" TIMESTAMPTZ NOT NULL,
  "dispute_reason" VARCHAR(500),
  "disputed_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "resolved_by_admin" UUID,
  "resolution_note" VARCHAR(500),
  "counted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "consultation_no_shows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consultation_no_shows_side_check" CHECK ("absent_side" IN ('attorney', 'client')),
  CONSTRAINT "consultation_no_shows_source_check" CHECK ("source" IN ('attorney', 'client', 'auto')),
  CONSTRAINT "consultation_no_shows_state_check" CHECK ("state" IN ('open', 'disputed', 'confirmed', 'withdrawn', 'overturned', 'unconfirmed'))
);
CREATE UNIQUE INDEX "consultation_no_shows_consultation_id_absent_side_key" ON "consultation_no_shows"("consultation_id", "absent_side");
CREATE INDEX "consultation_no_shows_state_dispute_until_idx" ON "consultation_no_shows"("state", "dispute_until");
CREATE INDEX "consultation_no_shows_absent_user_id_state_idx" ON "consultation_no_shows"("absent_user_id", "state");

CREATE TABLE "consultation_attendance_stats" (
  "user_id" UUID NOT NULL,
  "no_show_count" INTEGER NOT NULL DEFAULT 0,
  "disputed_count" INTEGER NOT NULL DEFAULT 0,
  "overturned_count" INTEGER NOT NULL DEFAULT 0,
  "last_no_show_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "consultation_attendance_stats_pkey" PRIMARY KEY ("user_id")
);
