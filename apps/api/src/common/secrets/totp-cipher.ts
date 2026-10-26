import { createDecipheriv, createHash } from 'node:crypto';
import { SecretEnvelope } from './secret-envelope';

/** AAD of an admin's authenticator secret: binds it to that admin row. */
export const totpAad = (adminId: string) => `admin_totp:${adminId}`;

/** Kid used when no rotation key list is configured: the single
 * ADMIN_TOTP_ENC_KEY, hashed exactly like the legacy `v1` format. */
export const TOTP_LEGACY_KID = 'totp1';

/**
 * AES-256-GCM for `admin_credentials.totp_secret_enc`.
 *
 * Security pass 2026-10-25 (S3-4): new values are SecretEnvelope strings
 * `v2.<kid>.<iv>.<tag>.<ct>` with AAD `admin_totp:<adminId>`, so the key can
 * rotate (keys from SECRETS_MASTER_KEYS when set, else the one
 * ADMIN_TOTP_ENC_KEY under kid `totp1`) and a secret cannot be pasted onto
 * another admin. Old values (`v1.<iv>.<tag>.<ct>`, no kid, no AAD) are
 * still read with ADMIN_TOTP_ENC_KEY and rewritten in the new format the
 * next time the admin signs in (or by the re-encryption button).
 */
export class SecretCipher {
  private readonly legacyKey: Buffer;
  private readonly envelope: SecretEnvelope;

  constructor(rawKey: string, rotation?: { keys: string; activeKid: string }) {
    if (rawKey.length < 32) {
      throw new Error('ADMIN_TOTP_ENC_KEY must be at least 32 characters');
    }
    // Any >=32-char string -> exactly 32 key bytes.
    this.legacyKey = createHash('sha256').update(rawKey).digest();
    this.envelope = rotation
      ? new SecretEnvelope(rotation.keys, rotation.activeKid)
      : new SecretEnvelope(`${TOTP_LEGACY_KID}:${rawKey}`, TOTP_LEGACY_KID);
  }

  encrypt(plain: string, adminId: string): string {
    return this.envelope.encrypt(plain, totpAad(adminId));
  }

  decrypt(stored: string, adminId: string): string {
    if (stored.startsWith('v1.')) return this.decryptLegacy(stored);
    return this.envelope.decrypt(stored, totpAad(adminId));
  }

  /** True for a legacy `v1` value or one under a retired key id. */
  needsRewrite(stored: string): boolean {
    if (stored.startsWith('v1.')) return true;
    if (!stored.startsWith('v2.')) return false; // e.g. 'pending-setup'
    return SecretEnvelope.kidOf(stored) !== this.envelope.activeKid;
  }

  private decryptLegacy(stored: string): string {
    const [version, iv, tag, ct] = stored.split('.');
    if (version !== 'v1' || !iv || !tag || !ct) {
      throw new Error('Unrecognized secret format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.legacyKey,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
