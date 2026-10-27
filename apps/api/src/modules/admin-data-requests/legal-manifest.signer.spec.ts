import { generateKeyPairSync } from 'node:crypto';
import {
  publicKeyPem,
  signManifest,
  verifyManifest,
} from './legal-manifest.signer';

const manifest = Buffer.from('{"hashes":{"a.json":"abc"}}');

describe('legal manifest signature', () => {
  it('seals with HMAC when no key is configured, and detects a change', () => {
    const opts = { fallbackSecret: 'pepper-pepper-pepper-pepper-1234' };
    const seal = signManifest(manifest, opts);
    expect(seal.alg).toBe('hmac-sha256');
    expect(seal.manifestSha256).toHaveLength(64);
    expect(verifyManifest(manifest, seal, opts)).toBe(true);
    expect(verifyManifest(Buffer.from('{"hashes":{}}'), seal, opts)).toBe(
      false,
    );
  });

  it('signs with ed25519 when a key is configured; the public key verifies', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const opts = { privateKeyPem: pem, fallbackSecret: 'x' };
    const seal = signManifest(manifest, opts);
    expect(seal.alg).toBe('ed25519');
    expect(verifyManifest(manifest, seal, opts)).toBe(true);
    expect(verifyManifest(Buffer.from('tampered'), seal, opts)).toBe(false);
    expect(publicKeyPem(pem)).toContain('BEGIN PUBLIC KEY');
  });

  it('refuses a key that is not ed25519', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() =>
      signManifest(manifest, { privateKeyPem: pem, fallbackSecret: 'x' }),
    ).toThrow('Ed25519');
  });
});
