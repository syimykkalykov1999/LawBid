SET LOCAL lock_timeout = '5s';

-- Owner 2026-10-22 (R-049): stories are hidden until the next update. The
-- catalog seed (createMany skipDuplicates) never touches an existing row,
-- so switch it off here — only where no admin ever changed it
-- (updated_by IS NULL: the row is still the seeded default).
UPDATE "feature_flags"
SET "enabled" = false
WHERE "key" = 'stories' AND "updated_by" IS NULL;
