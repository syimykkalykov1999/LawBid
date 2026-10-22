-- Owner 2026-10-21 (inbox 30): a switch per kind of notification; a key
-- not set follows the old category switch, so nobody's choice changes.
ALTER TABLE "users" ADD COLUMN "notif_topics" JSONB NOT NULL DEFAULT '{}';
