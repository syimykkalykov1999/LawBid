import { ThemePref } from '@prisma/client';

/** Owner 2026-10-22: Navy became Blue, Glass was removed (read as Night).
 *  Old rows and old apps may still hold the legacy values. */
export function normalizeThemePref(theme: ThemePref): ThemePref {
  if (theme === ThemePref.navy) return ThemePref.blue;
  if (theme === ThemePref.glass) return ThemePref.dark;
  return theme;
}
