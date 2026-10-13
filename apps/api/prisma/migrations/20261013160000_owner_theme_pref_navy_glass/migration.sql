-- Owner 2026-10-13: the app has four themes; Day = light, Night = dark.
ALTER TYPE "theme_pref" ADD VALUE IF NOT EXISTS 'navy';
ALTER TYPE "theme_pref" ADD VALUE IF NOT EXISTS 'glass';
