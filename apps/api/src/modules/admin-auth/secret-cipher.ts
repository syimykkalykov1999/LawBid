import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * AES-256-GCM for `admin_credentials.totp_secret_enc` (docs/06 §2.1,
 * .unlazy/FILE6_PLAN.md decision D: key from env ADMIN_TOTP_ENC_KEY, not
 * from the DB). Wire format `v1.<iv>.<tag>.<ciphertext>` (base64url) so
 * the algorithm can rotate later without a migration.
 */
export class SecretCipher {
  private readonly key: Buffer;

  constructor(rawKey: string) {
    if (rawKey.length < 32) {
      throw new Error('ADMIN_TOTP_ENC_KEY must be at least 32 characters');
    }
    // Any ≥32-char string → exactly 32 key bytes.
    this.key = createHash('sha256').update(rawKey).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', b64(iv), b64(tag), b64(ct)].join('.');
  }

  decrypt(stored: string): string {
    const [version, iv, tag, ct] = stored.split('.');
    if (version !== 'v1' || !iv || !tag || !ct) {
      throw new Error('Unrecognized secret format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

const b64 = (buf: Buffer) => buf.toString('base64url');
