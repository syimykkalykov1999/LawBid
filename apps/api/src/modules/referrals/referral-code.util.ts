import { randomInt } from 'node:crypto';

/** No 0/O, 1/I/L: codes are read aloud and typed from screenshots. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 7;
/** Generated codes are 6-8 of the alphabet above; an admin may set any
 * 4-24 letters/digits word (a vanity code), so lookups accept both. */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,24}$/;

export function generateReferralCode(
  length = REFERRAL_CODE_LENGTH,
  rand: (max: number) => number = randomInt,
): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += REFERRAL_CODE_ALPHABET[rand(REFERRAL_CODE_ALPHABET.length)];
  }
  return out;
}

/** What the user typed → the stored form (upper case, no spaces/dashes). */
export function normalizeReferralCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}
