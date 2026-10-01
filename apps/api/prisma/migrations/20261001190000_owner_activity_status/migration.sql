-- Owner 2026-10-01: "online / last seen" in chats, hideable like
-- Instagram's activity status (reciprocal). users.last_active_at becomes
-- the "last seen" time (set when the last app connection closes).
ALTER TABLE users ADD COLUMN show_activity_status BOOL NOT NULL DEFAULT true;
