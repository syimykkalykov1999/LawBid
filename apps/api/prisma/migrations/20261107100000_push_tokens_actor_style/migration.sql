-- Owner 2026-10-26 (notifications like WhatsApp): the app on this Android
-- device draws notifications with a person (bid, comment, like, follow,
-- missed call …) itself, with that person's round photo, from a
-- data-only push. Older app versions never set it and keep the normal alert.
-- A constant default: metadata-only on PostgreSQL 11+ (no table rewrite).
ALTER TABLE "push_tokens" ADD COLUMN "actor_style" BOOLEAN NOT NULL DEFAULT false;
