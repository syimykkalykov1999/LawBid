import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits) — what Google
 * Authenticator, 1Password, Authy etc. expect from an `otpauth://` URI.
 * Hand-rolled (~40 lines over node:crypto) instead of a dependency: admin
 * 2FA is a supply-chain-sensitive path (docs/06 §4.4) and the algorithm
 * is tiny and fully specified; totp.util.spec.ts pins the RFC vectors.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 (what authenticator apps take). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(
  secretBase32: string,
  atMs: number = Date.now(),
  stepOffset = 0,
): string {
  const counter = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32))
    .update(msg)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Accepts the current step and one step either side (clock drift). */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs: number = Date.now(),
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const candidate = Buffer.from(code);
  for (const offset of [0, -1, 1]) {
    const expected = Buffer.from(totpCode(secretBase32, atMs, offset));
    if (timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

export function otpauthUri(input: {
  issuer: string;
  account: string;
  secretBase32: string;
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secretBase32,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
