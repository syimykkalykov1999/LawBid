import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretEnvelope } from './secret-envelope';

/** Marks a stored body as ciphertext; anything else is legacy plaintext. */
const PREFIX = 'enc:';
/** Binds the ciphertext to the messages table (not pasteable elsewhere). */
const AAD = 'messages.body';
const SEALED = /^enc:v2\.[\w-]+\.[\w-]+\.[\w-]+\.[\w-]*$/;

/**
 * Scaling TZ point 11 (2026-10-04): chat message texts
 * (`messages.body_original` / `body_display`) are AES-256-GCM encrypted at
 * rest with MESSAGE_ENC_KEYS ("kid:secret,…", same rotation scheme as
 * SECRETS_MASTER_KEYS). Without keys (local dev) bodies stay plaintext.
 * Reads accept both forms, so rows written before the keys were set, the
 * system/call rows (localization keys, not user text) and the
 * anonymization's raw `[deleted]` stay readable.
 */
@Injectable()
export class MessageBodyCipher {
  private readonly logger = new Logger(MessageBodyCipher.name);
  private readonly envelope: SecretEnvelope | null;

  constructor(config: ConfigService) {
    const keys = config.get<string>('MESSAGE_ENC_KEYS');
    const kid = config.get<string>('MESSAGE_ENC_ACTIVE_KID');
    this.envelope = keys && kid ? new SecretEnvelope(keys, kid) : null;
  }

  get enabled(): boolean {
    return this.envelope !== null;
  }

  seal(plain: string): string {
    if (!this.envelope) return plain;
    return PREFIX + this.envelope.encrypt(plain, AAD);
  }

  open(stored: string): string {
    if (!SEALED.test(stored)) return stored;
    if (!this.envelope) {
      // Never hand ciphertext to a client: the keys are missing here.
      this.logger.error('Encrypted message body but MESSAGE_ENC_KEYS unset');
      return '';
    }
    try {
      return this.envelope.decrypt(stored.slice(PREFIX.length), AAD);
    } catch {
      // Plaintext that merely looks sealed (GCM rejects anything not
      // sealed by us), or a key removed too early.
      return stored;
    }
  }
}
