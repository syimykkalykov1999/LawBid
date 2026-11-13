-- Row 72 (failover test 2026-11-13, /data/lt/results/NOTES.md «FAILOVER»):
-- admin sessions lived only in Redis (adm:sess:*); a Redis restart without
-- data signed every admin out (~4 % 401 for the rest of the run). Prod
-- ElastiCache is one node without a replica or snapshots, so a node
-- replacement would do the same. This table is the source of truth; Redis
-- stays the hot copy (AdminSessionService). A new empty table: no rewrite,
-- no lock on existing data.
SET LOCAL lock_timeout = '5s';

CREATE TABLE "admin_sessions" (
    "jti" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "ip" VARCHAR(64),
    "device" VARCHAR(80),
    "fp" VARCHAR(32),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "admin_sessions_user_id_idx" ON "admin_sessions"("user_id");

ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
