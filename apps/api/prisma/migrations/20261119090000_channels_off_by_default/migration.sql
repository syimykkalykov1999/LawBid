SET LOCAL lock_timeout = '5s';

-- Owner 2026-11-07 (R-386): channels (communities) are hidden. The catalog
-- seed (createMany skipDuplicates) never touches an existing row, so switch
-- it off here — only where no admin ever changed it (updated_by IS NULL:
-- the row is still the seeded default).
UPDATE "feature_flags"
SET "enabled" = false
WHERE "key" = 'channels' AND "updated_by" IS NULL;
