import { randomBytes } from 'node:crypto';
import { keyStrengthProblem, weakKeysInList } from './key-strength';

describe('key strength (S3-13)', () => {
  it('accepts base64, base64url, hex and long random strings', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(keyStrengthProblem(randomBytes(32).toString('base64'))).toBeNull();
      expect(
        keyStrengthProblem(randomBytes(32).toString('base64url')),
      ).toBeNull();
      expect(keyStrengthProblem(randomBytes(32).toString('hex'))).toBeNull();
      expect(
        keyStrengthProblem(randomBytes(36).toString('base64') + '!#$%'),
      ).toBeNull();
    }
  });

  it('rejects short, repeated and dictionary-like strings', () => {
    expect(keyStrengthProblem('short')).toMatch(/shorter/);
    expect(keyStrengthProblem('a'.repeat(40))).toMatch(/hex|entropy/);
    expect(keyStrengthProblem('z'.repeat(40))).toMatch(/entropy/);
    expect(keyStrengthProblem('abababababababababababababababab')).toMatch(
      /hex|entropy/,
    );
    expect(
      keyStrengthProblem('correct horse battery staple correct horse'),
    ).toMatch(/entropy/);
    expect(keyStrengthProblem('0123456789abcdef0123456789abcdef')).toMatch(
      /hex/,
    );
    expect(keyStrengthProblem('0'.repeat(64))).toMatch(/entropy/);
  });

  it('checks every entry of a key list and lets kms: entries pass', () => {
    const good = randomBytes(32).toString('base64');
    expect(
      weakKeysInList(`m1:${good},m2:kms:AQIDAHhk,m3:${'x'.repeat(40)}`),
    ).toEqual(['m3: low entropy (not random)']);
  });
});
