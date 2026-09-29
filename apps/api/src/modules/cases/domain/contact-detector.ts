import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';

/**
 * docs/04_CASES_BIDS.md §3.3 — server-side detection of phone numbers,
 * emails and links in free text (title, description, city), so a client
 * can't hand out contact info that bypasses the platform's bid-then-
 * disclose flow (§1). Regex-based with light normalization (spelled-out
 * digits, "at"/"dot" obfuscation) as the spec's example ("нормализация
 * цифр и слов, например «пять пять пять»") asks for — not a full NLP
 * filter. False positives on unrelated long digit runs (e.g. a big
 * dollar figure typed without separators) are an accepted trade-off of
 * this heuristic; false negatives on exotic obfuscation are expected too.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// A closed TLD list, not `\.[a-z]{2,}`, so ordinary abbreviations like
// "e.g." or "U.S." never match a bare domain.
const TLDS =
  'com|net|org|io|co|me|info|biz|us|ru|edu|gov|app|dev|xyz|law|legal';
const BARE_DOMAIN_RE = new RegExp(
  `\\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b`,
  'i',
);
const URL_RE = /(https?:\/\/|www\.)\S+/i;

/** English + Russian spelled-out single digits (§3.3's own example). */
const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ноль: '0',
  один: '1',
  одна: '1',
  одно: '1',
  два: '2',
  две: '2',
  три: '3',
  четыре: '4',
  пять: '5',
  шесть: '6',
  семь: '7',
  восемь: '8',
  девять: '9',
};

// `\b` only recognizes ASCII word characters, so it silently fails to
// bound Cyrillic words (JS treats every Cyrillic letter as "non-word").
// Unicode property lookaround is the boundary that works for both
// alphabets.
const DIGIT_WORD_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${Object.keys(DIGIT_WORDS).join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
);

const AT_WORD_RE = /\s+(?:at|собака)\s+/gi;
const DOT_WORD_RE = /\s+(?:dot|точка)\s+/gi;

/** "five five five" -> "5 5 5", so the digit-run scan also catches
 * spelled-out phone numbers. */
function normalizeDigitWords(text: string): string {
  return text.replace(DIGIT_WORD_RE, (m) => DIGIT_WORDS[m.toLowerCase()]);
}

/** "name at example dot com" -> "name@example.com", so EMAIL_RE also
 * catches spelled-out obfuscation. */
function normalizeObfuscatedEmail(text: string): string {
  return text.replace(AT_WORD_RE, '@').replace(DOT_WORD_RE, '.');
}

/** Digits and typical phone punctuation (space, dash, dot, parens, plus)
 * keep a run going; anything else (a letter, a comma, ...) breaks it. */
const SEPARATOR_RE = /[\s\-.()+]/;

/** True if `text` has 7+ digits in a row, separated only by phone-style
 * punctuation — no letters or other breaks in between. 7 is the shortest
 * a US local number gets. */
function hasLongDigitRun(text: string): boolean {
  let digitCount = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      digitCount++;
    } else if (SEPARATOR_RE.test(ch)) {
      // Punctuation inside a phone number: keep the run going.
    } else {
      if (digitCount >= 7) return true;
      digitCount = 0;
    }
  }
  return digitCount >= 7;
}

/** True if `text` looks like it contains a phone number, email or link. */
export function containsContactInfo(text: string): boolean {
  if (!text) return false;
  // Full-width digits/letters (security review) fold to ASCII first.
  const lower = text.normalize('NFKC').toLowerCase();
  return (
    EMAIL_RE.test(lower) ||
    URL_RE.test(lower) ||
    BARE_DOMAIN_RE.test(lower) ||
    EMAIL_RE.test(normalizeObfuscatedEmail(lower)) ||
    hasLongDigitRun(normalizeDigitWords(lower))
  );
}

export function caseContainsContactInfo(field: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.CASE_CONTAINS_CONTACT_INFO,
    message:
      "Don't include contact info in the description: it's shared automatically with the attorney you choose.",
    details: { field },
  });
}

/** Throws CASE_CONTAINS_CONTACT_INFO (400) for the first offending field
 * (title / description / city — §3.3), details.field names it. Only
 * defined, non-empty values are checked (a field the caller didn't touch
 * on an edit is not re-scanned). */
export function assertNoContactInfo(
  fields: Record<string, string | null | undefined>,
): void {
  for (const [field, value] of Object.entries(fields)) {
    if (value && containsContactInfo(value)) {
      throw caseContainsContactInfo(field);
    }
  }
}

/** docs/05 §8.3: what a hidden contact is replaced with in `body_display`
 * (the app shows its localized form of this marker). */
export const CONTACT_MASK = '[контакт скрыт]';

const DIGIT_TOKEN = `(?:\\d|(?<![\\p{L}\\p{N}])(?:${Object.keys(DIGIT_WORDS).join('|')})(?![\\p{L}\\p{N}]))`;
/** 7+ digits (or spelled-out digits) separated only by phone punctuation. */
const PHONE_RUN_RE = new RegExp(
  `(?:\\+\\s*)?\\(?${DIGIT_TOKEN}(?:[\\s\\-.()]*${DIGIT_TOKEN}){6,}`,
  'giu',
);
const OBFUSCATED_EMAIL_RE =
  /[a-z0-9._%+-]+\s+(?:at|собака)\s+[a-z0-9-]+(?:\s*(?:\.|dot|точка)\s*[a-z0-9-]+)+/giu;

/**
 * docs/05 §8.3 (file 04 §9): replaces phone numbers (with separators or
 * spelled out), emails (also "name at site dot com") and links with
 * CONTACT_MASK. Same heuristics as containsContactInfo().
 */
export function maskContactInfo(text: string): {
  text: string;
  masked: boolean;
} {
  let out = text.normalize('NFKC');
  for (const re of [
    new RegExp(URL_RE.source, 'gi'),
    new RegExp(EMAIL_RE.source, 'gi'),
    OBFUSCATED_EMAIL_RE,
    new RegExp(BARE_DOMAIN_RE.source, 'gi'),
    PHONE_RUN_RE,
  ]) {
    out = out.replace(re, CONTACT_MASK);
  }
  return { text: out, masked: out !== text };
}
