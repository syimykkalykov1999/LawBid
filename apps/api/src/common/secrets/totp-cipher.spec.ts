import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { SecretCipher } from './totp-cipher';

const TOTP_KEY = 't'.repeat(40);
const K1 = 'a'.repeat(40);
const K2 = 'b'.repeat(40);

/** The pre-2026-10-25 writer, kept here to prove old rows still open. */
function legacyEncrypt(plain: string, rawKey: string): string {
  const key = createHash('sha256').update(rawKey).digest();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), ct]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

describe('SecretCipher (admin authenticator secrets)', () => {
  it('seals with a kid and an admin-bound AAD', () => {
    const c = new SecretCipher(TOTP_KEY);
    const sealed = c.encrypt('JBSWY3DPEHPK3PXP', 'admin-1');
    expect(sealed.startsWith('v2.totp1.')).toBe(true);
    expect(c.decrypt(sealed, 'admin-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(() => c.decrypt(sealed, 'admin-2')).toThrow();
  });

  it('still reads the old v1 format and flags it for rewrite', () => {
    const c = new SecretCipher(TOTP_KEY);
    const old = legacyEncrypt('JBSWY3DPEHPK3PXP', TOTP_KEY);
    expect(c.decrypt(old, 'admin-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(c.needsRewrite(old)).toBe(true);
    expect(c.needsRewrite(c.encrypt('X', 'admin-1'))).toBe(false);
    expect(c.needsRewrite('pending-setup')).toBe(false);
  });

  it('a master-key rotation keeps the admin able to sign in', () => {
    // Before: kid k1 is active.
    const before = new SecretCipher(TOTP_KEY, {
      keys: `k1:${K1}`,
      activeKid: 'k1',
    });
    const stored = before.encrypt('SECRETSECRET', 'admin-1');
    const legacy = legacyEncrypt('OTHERSECRET', TOTP_KEY);
    // After: k2 is active, k1 is kept for reading.
    const after = new SecretCipher(TOTP_KEY, {
      keys: `k1:${K1},k2:${K2}`,
      activeKid: 'k2',
    });
    expect(after.decrypt(stored, 'admin-1')).toBe('SECRETSECRET');
    expect(after.decrypt(legacy, 'admin-2')).toBe('OTHERSECRET');
    expect(after.needsRewrite(stored)).toBe(true);
    // Rewrite-on-use: sealed under k2, k1 is no longer needed.
    const rewritten = after.encrypt(
      after.decrypt(stored, 'admin-1'),
      'admin-1',
    );
    expect(rewritten.startsWith('v2.k2.')).toBe(true);
    expect(after.needsRewrite(rewritten)).toBe(false);
    const onlyK2 = new SecretCipher(TOTP_KEY, {
      keys: `k2:${K2}`,
      activeKid: 'k2',
    });
    expect(onlyK2.decrypt(rewritten, 'admin-1')).toBe('SECRETSECRET');
  });
});
