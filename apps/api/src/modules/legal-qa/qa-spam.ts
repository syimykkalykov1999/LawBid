import { createHash } from 'node:crypto';

/**
 * Owner 2026-10-28 (legal safety): pure helpers for the spam / abuse checks
 * of «Вопрос юристу» — duplicate fingerprint, link count, and the
 * "individualized legal advice" reading of an answer.
 */

/** Same words, same fingerprint: case, punctuation and spacing ignored. */
export function normalizeForHash(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function contentHash(...parts: string[]): string {
  return createHash('sha256')
    .update(normalizeForHash(parts.join(' ')))
    .digest('hex');
}

const LINK_RE =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|me|info|biz|us|ru|edu|gov|app|dev|xyz|law|legal|ly|gl)\b\S*/gi;

/** Links in the raw text (before the contact mask hides them). */
export function countLinks(text: string): number {
  return (text.normalize('NFKC').match(LINK_RE) ?? []).length;
}

/**
 * Phrases that turn general information into advice about THIS person's
 * facts: second-person directives, predictions of the outcome, "in your
 * case". Two hits mean an individualized answer (one is common in ordinary
 * general information such as "you should consult an attorney").
 */
const ADVICE: RegExp[] = [
  /\bin your (?:case|situation|circumstances)\b/i,
  /\byou (?:should|must|need to|have to|ought to) (?!consult|speak|talk|contact|hire|seek|see an? (?:attorney|lawyer))/i,
  /\bi (?:advise|recommend|suggest|urge) (?:you|that you)\b/i,
  /\byou (?:have|'ve got) (?:a|an) (?:strong|good|solid|winning|weak|great) (?:case|claim)\b/i,
  /\byou (?:will|would|can|could|should) (?:win|lose|sue|recover|get)\b/i,
  /\b(?:do not|don't|never) (?:sign|pay|file|answer|respond|settle|accept|admit)\b/i,
  /\bi (?:guarantee|promise)\b/i,
  /\byour (?:best|only) (?:option|move|course)\b/i,
  /\b(?:file|sue|appeal) (?:immediately|right away|now)\b/i,
];

export function adviceScore(text: string): number {
  return ADVICE.filter((re) => re.test(text)).length;
}

export const ADVICE_THRESHOLD = 2;

export function looksLikeIndividualAdvice(text: string): boolean {
  return adviceScore(text) >= ADVICE_THRESHOLD;
}
