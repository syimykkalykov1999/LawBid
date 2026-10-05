import { createHmac } from 'node:crypto';
import type { FpKind } from './client-fraud.constants';

/**
 * The stored form of an identity signal: HMAC-SHA256 under a server
 * secret (AUTH_EVENT_PEPPER), so a leaked table cannot be reversed by
 * hashing every phone number. The kind is part of the input: the same
 * string as an e-mail and as a device never collide.
 */
export function fingerprintHash(
  pepper: string,
  kind: FpKind,
  value: string,
): string {
  return createHmac('sha256', pepper)
    .update(`fraud-fp:v1:${kind}:${normalizeSignal(kind, value)}`)
    .digest('hex');
}

/** Same person, same value: e-mail and text are case-insensitive, Gmail
 * dots and "+tags" are dropped, a phone keeps only "+" and digits. */
export function normalizeSignal(kind: FpKind, value: string): string {
  const v = value.trim();
  switch (kind) {
    case 'email': {
      const lower = v.toLowerCase();
      const at = lower.lastIndexOf('@');
      if (at < 1) return lower;
      let local = lower.slice(0, at);
      let domain = lower.slice(at + 1);
      if (domain === 'googlemail.com') domain = 'gmail.com';
      local = local.split('+')[0];
      if (domain === 'gmail.com') local = local.replace(/\./g, '');
      return `${local}@${domain}`;
    }
    case 'phone':
      return v.replace(/[^\d+]/g, '');
    case 'text':
      return v
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    default:
      return v;
  }
}

/** A case text worth comparing: short texts ("need a lawyer") repeat
 * between honest people and are ignored. */
export function isComparableText(text: string): boolean {
  return normalizeSignal('text', text).length >= 60;
}
