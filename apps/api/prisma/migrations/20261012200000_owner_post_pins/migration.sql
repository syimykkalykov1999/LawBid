-- Owner 2026-10-12: an author pins up to 3 posts (the profile grid) and up
-- to 3 briefs (text-only posts, the Briefs tab) to the top, each in its
-- own slot 1..3. pin_group says which of the two lists the pin belongs to.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "pin_slot" INT2;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "pin_group" TEXT;

ALTER TABLE "posts" ADD CONSTRAINT "posts_pin_slot_range" CHECK ("pin_slot" IS NULL OR ("pin_slot" BETWEEN 1 AND 3));
ALTER TABLE "posts" ADD CONSTRAINT "posts_pin_group_valid" CHECK (("pin_slot" IS NULL AND "pin_group" IS NULL) OR ("pin_slot" IS NOT NULL AND "pin_group" IN ('grid', 'brief')));

CREATE UNIQUE INDEX IF NOT EXISTS "posts_pin_slot_key" ON "posts"("author_id", "pin_group", "pin_slot") WHERE "pin_slot" IS NOT NULL;
