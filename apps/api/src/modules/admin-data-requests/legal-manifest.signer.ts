import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from 'node:crypto';

/**
 * Owner 2026-10-28 (legal requests): the manifest of a production (the list
 * of every file with its SHA-256) is signed, so a court or the other side
 * can check that the archive was not changed after it left LawBid.
 *
 * - `ed25519`: the strong option. Set LEGAL_MANIFEST_SIGNING_KEY to an
 *   Ed25519 private key (PEM); anyone holding the public key (shown in the
 *   admin) can verify the signature without any secret.
 * - `hmac-sha256`: the default when no key is set (cost 0, nothing to
 *   configure). Proves integrity to LawBid only; the admin says so.
 */
export type ManifestAlg = 'ed25519' | 'hmac-sha256';

export interface ManifestSeal {
  alg: ManifestAlg;
  /** Hex of SHA-256(manifest bytes). */
  manifestSha256: string;
  /** Base64 signature (ed25519) or hex HMAC. */
  signature: string;
}

export const sha256Hex = (b: Buffer): string =>
  createHash('sha256').update(b).digest('hex');

function hmacKey(secret: string): Buffer {
  return createHash('sha256')
    .update(`lawbid-legal-manifest-v1:${secret}`)
    .digest();
}

export function signManifest(
  manifest: Buffer,
  opts: { privateKeyPem?: string; fallbackSecret: string },
): ManifestSeal {
  const manifestSha256 = sha256Hex(manifest);
  if (opts.privateKeyPem) {
    const key = createPrivateKey(opts.privateKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('LEGAL_MANIFEST_SIGNING_KEY must be an Ed25519 key');
    }
    return {
      alg: 'ed25519',
      manifestSha256,
      signature: sign(null, manifest, key).toString('base64'),
    };
  }
  return {
    alg: 'hmac-sha256',
    manifestSha256,
    signature: createHmac('sha256', hmacKey(opts.fallbackSecret))
      .update(manifest)
      .digest('hex'),
  };
}

export function verifyManifest(
  manifest: Buffer,
  seal: Pick<ManifestSeal, 'alg' | 'signature'>,
  opts: { privateKeyPem?: string; fallbackSecret: string },
): boolean {
  if (seal.alg === 'ed25519') {
    if (!opts.privateKeyPem) return false;
    const pub = createPublicKey(createPrivateKey(opts.privateKeyPem));
    return verify(null, manifest, pub, Buffer.from(seal.signature, 'base64'));
  }
  const expected = createHmac('sha256', hmacKey(opts.fallbackSecret))
    .update(manifest)
    .digest();
  const got = Buffer.from(seal.signature, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** PEM of the public half, for the admin screen (never the private key). */
export function publicKeyPem(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: 'spki', format: 'pem' })
    .toString();
}
