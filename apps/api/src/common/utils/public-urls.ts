/** The public web origin when APP_LINK_BASE_URL is not set. */
export const DEFAULT_PUBLIC_ORIGIN = 'https://lawbid.app';

/**
 * Owner 2026-10-22 (audit #4 §9): the canonical public page of an attorney
 * — the static SEO page scripts/seo/build.mjs writes at
 * `/attorneys/<username>/` (lower case, trailing slash). The app shares
 * this link instead of building its own, so a shared profile always lands
 * on the page search engines index.
 */
export function attorneyPublicUrl(
  username: string,
  base: string | undefined | null,
): string {
  const origin = (base || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
  return `${origin}/attorneys/${encodeURIComponent(username.toLowerCase())}/`;
}
