-- Owner 2026-10-22: themes Day / Night / Blue / Green. Expand-only: `navy`
-- and `glass` stay (old apps still send them); the API reads navy as blue
-- and glass as dark.
ALTER TYPE "theme_pref" ADD VALUE IF NOT EXISTS 'blue';
ALTER TYPE "theme_pref" ADD VALUE IF NOT EXISTS 'green';
