import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  verifyTotp,
} from './totp.util';

// RFC 6238 Appendix B (SHA-1, secret "12345678901234567890"): the last six
// digits of the 8-digit reference values.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('totp.util', () => {
  it('base32 round-trips', () => {
    const buf = Buffer.from('12345678901234567890');
    expect(base32Encode(buf)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it.each(VECTORS)('matches RFC 6238 at t=%s', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it('verifies the current step and ±1 step, nothing else', () => {
    const at = 1111111111 * 1000;
    expect(verifyTotp(RFC_SECRET, '050471', at)).toBe(true);
    expect(verifyTotp(RFC_SECRET, '081804', at)).toBe(true); // previous step
    expect(verifyTotp(RFC_SECRET, '287082', at)).toBe(false); // t=59
    expect(verifyTotp(RFC_SECRET, '12345', at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', at)).toBe(false);
  });

  it('generates 32-char base32 secrets and a standard otpauth URI', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = otpauthUri({
      issuer: 'LawBid Admin',
      account: 'a@b.co',
      secretBase32: secret,
    });
    expect(uri.startsWith('otpauth://totp/LawBid%20Admin%3Aa%40b.co?')).toBe(
      true,
    );
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('issuer=LawBid+Admin');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
