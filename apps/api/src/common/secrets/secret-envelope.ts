import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

/**
 * Owner 2026-10-01: AES-256-GCM envelope for the API keys the owner keeps
 * in the admin (integration_credentials.secret_enc). Wire format
 * `v2.<kid>.<iv>.<tag>.<ct>` (base64url). Keys come from env
 * SECRETS_MASTER_KEYS ("kid:secret,…"): the active kid encrypts, any
 * listed kid decrypts (rotation). The AAD binds a ciphertext to its row
 * ("provider:version"), so it can't be pasted onto another provider.
 */
export class SecretEnvelope {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    rawKeys: string,
    readonly activeKid: string,
  ) {
    for (const pair of rawKeys.split(',')) {
      const i = pair.indexOf(':');
      const kid = pair.slice(0, i);
      const secret = pair.slice(i + 1);
      if (!kid || secret.length < 32) {
        throw new Error('SECRETS_MASTER_KEYS: each key needs >= 32 chars');
      }
      // Any ≥32-char string → exactly 32 key bytes.
      this.keys.set(kid, createHash('sha256').update(secret).digest());
    }
    if (!this.keys.has(activeKid)) {
      throw new Error('SECRETS_ACTIVE_KID is not in SECRETS_MASTER_KEYS');
    }
  }

  encrypt(plain: string, aad: string): string {
    const key = this.keys.get(this.activeKid)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      'v2',
      this.activeKid,
      b64(iv),
      b64(cipher.getAuthTag()),
      b64(ct),
    ].join('.');
  }

  decrypt(stored: string, aad: string): string {
    const [version, kid, iv, tag, ct] = stored.split('.');
    const key = kid ? this.keys.get(kid) : undefined;
    if (version !== 'v2' || !key || !iv || !tag || !ct) {
      throw new Error('Unrecognized secret format or unknown key id');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** The kid of a stored envelope (re-encryption after rotation). */
  static kidOf(stored: string): string | null {
    return stored.split('.')[1] ?? null;
  }

  /** A short, non-reversible fingerprint of a credential bundle. */
  fingerprint(plain: string): string {
    const key = this.keys.get(this.activeKid)!;
    return createHmac('sha256', key).update(plain).digest('hex').slice(0, 12);
  }
}

const b64 = (buf: Buffer) => buf.toString('base64url');

/** "••••a1b2" — the last 4 characters of a long secret, nothing for short. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '••••';
  return `••••${value.slice(-4)}`;
}
