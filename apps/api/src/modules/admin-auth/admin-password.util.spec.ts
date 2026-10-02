import {
  hashSecret,
  normalizeAnswer,
  normalizeLogin,
  passwordProblem,
  verifySecret,
  LOGIN_PATTERN,
} from './admin-password.util';

describe('admin password util', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashSecret('correct horse 42');
    const b = await hashSecret('correct horse 42');
    expect(a).not.toEqual(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifySecret('correct horse 42', a)).toBe(true);
    expect(await verifySecret('wrong horse 42', a)).toBe(false);
    expect(await verifySecret('x', null)).toBe(false);
    expect(await verifySecret('x', 'garbage')).toBe(false);
  });

  it('compares security answers ignoring case and spacing', () => {
    expect(normalizeAnswer('  Мама   ЛЮБА ')).toBe('мама люба');
  });

  it('normalizes and validates logins', () => {
    expect(normalizeLogin('  The.Sima ')).toBe('the.sima');
    expect(LOGIN_PATTERN.test('the.sima')).toBe(true);
    expect(LOGIN_PATTERN.test('ab')).toBe(false);
    expect(LOGIN_PATTERN.test('-bad-')).toBe(false);
    expect(LOGIN_PATTERN.test('has space')).toBe(false);
  });

  it('rejects weak passwords with a reason', () => {
    expect(passwordProblem('short1')).toMatch(/at least 10/);
    expect(passwordProblem('onlyletterspassword')).toMatch(
      /letters and digits/,
    );
    expect(passwordProblem('the.sima12345', 'the.sima')).toMatch(/login/);
    expect(passwordProblem('Good-pass-2026')).toBeNull();
  });
});
