/** Owner 2026-10-20: conflict-of-interest matching, pure. A person (the
 * client of a case, or an attorney's former client) is looked for in the
 * text of a case card by name, phone and e-mail. */

export interface Person {
  name: string;
  phone: string | null;
  email: string | null;
}

export type MatchBy = 'name' | 'phone' | 'email';

const strip = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

/** Letters and digits only, one space between words. */
export const normalizeText = (s: string): string =>
  strip(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The last 10 digits of a phone number (country code and formatting
 * dropped), or null when there are fewer than 7. */
export function phoneKey(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D+/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

/** A name worth matching: two or more words of two or more letters. */
export function nameKey(name: string): string | null {
  const words = normalizeText(name)
    .split(' ')
    .filter((w) => w.length >= 2);
  return words.length >= 2 ? words.join(' ') : null;
}

/** How [person] shows up in [text] ([] = not at all). */
export function matchesIn(person: Person, text: string): MatchBy[] {
  const out: MatchBy[] = [];
  const norm = ` ${normalizeText(text)} `;
  const name = nameKey(person.name);
  if (name && norm.includes(` ${name} `)) out.push('name');
  const phone = phoneKey(person.phone);
  if (phone && text.replace(/\D+/g, '').includes(phone)) out.push('phone');
  const email = person.email?.trim().toLowerCase();
  if (email && email.includes('@') && strip(text).includes(email)) {
    out.push('email');
  }
  return out;
}
