// Quality gate and rollout ramp for the static pages (plan §2.3, §2.7).
// A page that does not pass the gate is `noindex,follow` and stays out of
// the sitemaps; pages that pass are admitted to the index at most
// `perDay` new ones per day. Pure functions, no I/O.

// Wording a lawyer-advertising rule (NY RPC 7.1) does not allow without proof.
const BANNED = /(^|[^\w])(best|number\s*(one|1)|guarantee[sd]?|top[- ]rated|top[- ]ranked)(?![\w])|#\s?1(?!\d)/i;
// "the best interests of the child" is the legal standard of family law, not a boast.
export const hasBannedClaim = (text) => BANNED.test(String(text ?? '').replace(/best\s+interests?/gi, ' '));

const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);

/** Visible text of the page body (inside <main>), tags removed. */
export function mainText(html) {
  const m = /<main>([\s\S]*?)<\/main>/.exec(html);
  return decode((m ? m[1] : html).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export const wordCount = (text) => (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

// minPostChars / minQaChars / minCityAttorneys belong to the page types added
// 2026-10-27 (attorney posts, legal Q&A, city hubs): plan §2.1 (a post needs a
// text of at least 300 characters, a city hub at least 3 attorneys). Those
// three types are gated whether or not `enabled` is on: they are new, so there
// is no live behaviour to keep, and the page-type switches are their off button.
export const defaultGate = { enabled: false, minWords: 300, minAttorneys: 3, minBioChars: 150, minPostChars: 300, minQaChars: 300, minCityAttorneys: 3 };

// Contact data and identifiers that never belong on a generated page: an e-mail
// address, a US phone number written with separators, a social security number.
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.-]+|(?<!\d)\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)|(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/;
export const hasContactInfo = (text) => CONTACT.test(String(text ?? ''));

/**
 * Should this page be indexed?
 * kind: 'profile' | 'combo' (state x practice) | 'page' (state, practice: needs
 * enough text) | 'hub' (the directory home: navigation, never thin) |
 * 'post' (an attorney's text post: `chars` of body) | 'qa' (a legal question:
 * `chars` of the reviewed answer) | 'city' (practice x city hub)
 * baseIndex: the generator's own rule (e.g. empty low-demand combos).
 * Returns { index, reason }.
 */
export function gateDecision({ kind, baseIndex, words = 0, attorneyCount = 0, chars = 0, bio = '', claimsText = '', gate }) {
  if (!baseIndex) return { index: false, reason: 'low-demand-empty' };
  if (kind === 'post' || kind === 'qa') {
    const min = (kind === 'post' ? gate?.minPostChars : gate?.minQaChars) ?? (kind === 'post' ? defaultGate.minPostChars : defaultGate.minQaChars);
    if (chars < min) return { index: false, reason: kind === 'post' ? 'thin-post' : 'thin-answer' };
    if (hasBannedClaim(claimsText)) return { index: false, reason: 'unverified-claim' };
    return { index: true, reason: null };
  }
  if (kind === 'city') {
    if (attorneyCount < (gate?.minCityAttorneys ?? defaultGate.minCityAttorneys)) return { index: false, reason: 'few-attorneys' };
    return { index: true, reason: null };
  }
  if (!gate?.enabled) return { index: true, reason: null };
  if (kind === 'profile') {
    if (String(bio ?? '').trim().length < gate.minBioChars) return { index: false, reason: 'thin-profile' };
    if (hasBannedClaim(claimsText)) return { index: false, reason: 'unverified-claim' };
    return { index: true, reason: null };
  }
  if (kind === 'combo') {
    if (attorneyCount < gate.minAttorneys) return { index: false, reason: 'few-attorneys' };
    return { index: true, reason: null };
  }
  if (kind === 'hub') return { index: true, reason: null };
  if (words < gate.minWords) return { index: false, reason: 'thin-page' };
  return { index: true, reason: null };
}

/**
 * New-page ramp. candidates: [{ path, priority }] that passed the gate.
 * prev: the previous manifest (or null). Returns { admitted: Map<path, date>,
 * deferred: [path], budget, baseline }.
 *  - No ramp history yet (first run with the ramp): baseline 'all' admits
 *    every candidate (the live site's pages are already indexed and must not
 *    be dropped); baseline 'none' starts from zero.
 *  - Afterwards pages already admitted stay; at most perDay new ones per
 *    calendar day (a second run on the same day shares the day's budget),
 *    higher priority first, then path order.
 */
export function applyRamp({ candidates, prev, today, perDay, baseline = 'all' }) {
  const admitted = new Map();
  const hasHistory = Boolean(prev?.ramp);
  if (!hasHistory && baseline === 'all') {
    for (const c of candidates) admitted.set(c.path, 'baseline');
    return { admitted, deferred: [], budget: 0, baseline: true };
  }
  let usedToday = 0;
  const fresh = [];
  for (const c of candidates) {
    const was = prev?.pages?.[c.path]?.admitted;
    if (was) {
      admitted.set(c.path, was);
      if (was === today) usedToday++;
    } else fresh.push(c);
  }
  fresh.sort((a, b) => Number(b.priority) - Number(a.priority) || (a.path < b.path ? -1 : 1));
  const budget = Math.max(0, perDay - usedToday);
  for (const c of fresh.slice(0, budget)) admitted.set(c.path, today);
  return { admitted, deferred: fresh.slice(budget).map((c) => c.path), budget, baseline: false };
}
