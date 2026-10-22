-- Owner 2026-10-22 (audit #4 §8): the app no longer has the «Справочник»
-- screen; its eight section switches go (the admin page is removed too).
DELETE FROM "feature_flags" WHERE "key" LIKE 'guide\_section\_%';
