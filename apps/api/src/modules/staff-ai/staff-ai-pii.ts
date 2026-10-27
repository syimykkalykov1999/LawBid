import { createHash } from 'node:crypto';

/**
 * Staff package T12: PII minimisation for everything that leaves for the
 * Claude API (plan D: «в ИИ не уходят паспорт/телефон/e-mail»).
 *
 * Two layers: the context loaders only select the text a reviewer would see
 * (never names, e-mails, phones, documents or private chats), and
 * `scrubPii` runs over EVERY outgoing string in StaffAiClient as a safety
 * net, so a loader that forgets something still cannot leak it.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Phone-like or long numeric runs: digits with spaces, dots, dashes, parens. */
const NUMBER_RUN = /\+?\d(?:[\d\s().-]{5,}\d)/g;
/** A date (and maybe the hour digits the number matcher swallowed with it). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2})?$/;
/** Passport / ID numbers: 1-2 letters then 6-9 digits (AB1234567, N12345678). */
const ID_DOC = /\b[A-Za-z]{1,2}\d{6,9}\b/g;
const URL_WITH_QUERY = /(https?:\/\/[^\s?#]+)[?#]\S*/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const SECRET_LIKE =
  /\b(?:sk|pk|rk)[-_](?:live|test|ant)?[-_]?[A-Za-z0-9_-]{16,}\b/g;

/** Replaces e-mails, phone / card / SSN-like numbers, document ids, IPs,
 * URL query strings and key-like tokens with a short placeholder. */
export function scrubPii(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(SECRET_LIKE, '[secret]')
    .replace(URL_WITH_QUERY, '$1')
    .replace(IPV4, (m) =>
      m.split('.').every((p) => Number(p) <= 255) ? '[ip]' : m,
    )
    .replace(ID_DOC, '[id]')
    .replace(NUMBER_RUN, (m) => {
      if (ISO_DATE.test(m.trim())) return m;
      const digits = m.replace(/\D/g, '').length;
      if (digits < 7) return m;
      return digits >= 12 ? '[number]' : '[phone]';
    });
}

/** True when `text` still holds something the scrubber removes. */
export function hasPii(text: string): boolean {
  return scrubPii(text) !== text;
}

/** Cuts to `max` characters on a word edge and scrubs. */
export function cleanText(
  text: string | null | undefined,
  max: number,
): string {
  if (!text) return '';
  const flat = scrubPii(text.replace(/\s+/g, ' ').trim());
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * A stable short reference for an id (12 hex chars of SHA-256 over a fixed
 * label + the id): the model can tell cases apart, the real id never leaves.
 */
export function hashRef(id: string): string {
  return createHash('sha256')
    .update(`lawbid-staff-ai:${id}`)
    .digest('hex')
    .slice(0, 12);
}
