-- Owner 2026-10-12: a thread (a text-only post) is up to 5000 characters;
-- posts with files keep 2200 (checked in the service).
ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_body_len";
ALTER TABLE "posts" ADD CONSTRAINT "posts_body_len" CHECK (char_length("body") <= 5000);
