/**
 * Owner 2026-10-13: ONE tag algorithm for Topics, search, the Reels filters,
 * hashtag chips and profile filters. A post's qualification is stored as
 * hidden tags — `~family` and `~family.divorce` for "family.divorce" (the
 * category and every level under it, so a category filter is one lookup, no
 * prefix scan). `~` cannot occur in a typed hashtag, and the chips, tag
 * search and trending never show a hidden tag.
 */
export const HIDDEN_TAG_PREFIX = '~';

export function isHiddenTag(tag: string): boolean {
  return tag.startsWith(HIDDEN_TAG_PREFIX);
}

/** The hidden tag of one qualification code (`family.divorce`). */
export function hiddenTagOf(code: string): string {
  return `${HIDDEN_TAG_PREFIX}${code.trim().toLowerCase()}`;
}

/** The tags written on a post: the code and each ancestor of it. */
export function hiddenTagsFor(code: string | null | undefined): string[] {
  if (!code) return [];
  const parts = code.trim().toLowerCase().split('.').filter(Boolean);
  return parts.map((_, i) => hiddenTagOf(parts.slice(0, i + 1).join('.')));
}
