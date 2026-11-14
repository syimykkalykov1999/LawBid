/**
 * Transition type of the menu links (sidebar, section tabs, bottom bar).
 * Owner row 88 (2026-11-13): only a navigation that carries it crossfades the
 * page (<ViewTransition> in app-shell.tsx, CSS in globals.css); the browser's
 * back / forward carries no type, so it swaps at once (Next.js guide
 * «Designing view transitions», 2026-10-15).
 */
export const NAV_TRANSITION = 'admin-nav';

/** Stable array for `<Link transitionTypes>` (one object for every render). */
export const NAV_TRANSITION_TYPES = [NAV_TRANSITION];
