import { maskSecret, SecretEnvelope } from './secret-envelope';

const K1 = 'k1:0123456789abcdef0123456789abcdef';
const K2 = 'k2:fedcba9876543210fedcba9876543210';

describe('SecretEnvelope (owner 2026-10-01)', () => {
  it('round-trips with the active key and records the kid', () => {
    const env = new SecretEnvelope(K1, 'k1');
    const sealed = env.encrypt('{"apiKey":"secret"}', 'bunny_stream:1');
    expect(sealed.startsWith('v2.k1.')).toBe(true);
    expect(sealed).not.toContain('secret');
    expect(env.decrypt(sealed, 'bunny_stream:1')).toBe('{"apiKey":"secret"}');
  });

  it('a row copied to another provider / version does not decrypt', () => {
    const env = new SecretEnvelope(K1, 'k1');
    const sealed = env.encrypt('x', 'stripe:1');
    expect(() => env.decrypt(sealed, 'twilio:1')).toThrow();
    expect(() => env.decrypt(sealed, 'stripe:2')).toThrow();
  });

  it('rotation: old rows still decrypt, new rows use the new kid', () => {
    const old = new SecretEnvelope(K1, 'k1');
    const sealed = old.encrypt('v', 'turn:1');
    const rotated = new SecretEnvelope(`${K1},${K2}`, 'k2');
    expect(rotated.decrypt(sealed, 'turn:1')).toBe('v');
    expect(SecretEnvelope.kidOf(rotated.encrypt('v', 'turn:2'))).toBe('k2');
    // Without the old key the old row is unreadable.
    expect(() =>
      new SecretEnvelope(K2, 'k2').decrypt(sealed, 'turn:1'),
    ).toThrow();
  });

  it('refuses short keys and an unknown active kid', () => {
    expect(() => new SecretEnvelope('k1:short', 'k1')).toThrow();
    expect(() => new SecretEnvelope(K1, 'k9')).toThrow();
  });

  it('masks all but the last 4 characters', () => {
    expect(maskSecret('sk_live_abcdefgh1234')).toBe('••••1234');
    expect(maskSecret('short')).toBe('••••');
  });
});
