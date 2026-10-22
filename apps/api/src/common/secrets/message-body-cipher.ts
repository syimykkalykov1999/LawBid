import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretEnvelope } from './secret-envelope';

/** Marks a stored body as ciphertext; anything else is legacy plaintext. */
const PREFIX = 'enc:';
/** v2 (legacy, read-only): one AAD for the whole table. */
const AAD_V2 = 'messages.body';
/** v3 envelope marker, written in place of the inner `v2` version tag. */
const V3 = 'v3';
/** v3: the AAD binds the ciphertext to its own message row, so a
 * ciphertext copied onto another message (DB write access) fails. */
const aadV3 = (messageId: string) => `messages.body:${messageId}`;
const SEALED = /^enc:v[23]\.[\w-]+\.[\w-]+\.[\w-]+\.[\w-]*$/;

/**
 * Scaling TZ point 11 (2026-10-04): chat message texts
 * (`messages.body_original` / `body_display`, and `message_edits` copies
 * of `body_original`) are AES-256-GCM encrypted at rest with
 * MESSAGE_ENC_KEYS ("kid:secret,…", same rotation scheme as
 * SECRETS_MASTER_KEYS). Without keys (local dev) bodies stay plaintext.
 * Reads accept both forms, so rows written before the keys were set, the
 * system/call rows (localization keys, not user text) and the
 * anonymization's raw `[deleted]` stay readable.
 *
 * Audit #6 (2026-10-22): new rows are `enc:v3.<kid>.<iv>.<tag>.<ct>` with
 * AAD `messages.body:<messageId>` (an edit copy uses its message's id);
 * old `enc:v2…` rows (constant AAD) still open. A body that fails to open
 * is logged loudly (message id + key id, never the text) and read as ''
 * — the app shows «Не удалось расшифровать» — instead of leaking the
 * ciphertext. Re-encryption and KMS: docs/SECURITY_TODO.md.
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

  /** [messageId]: the id of the `messages` row the body belongs to. */
  seal(plain: string, messageId: string): string {
    if (!this.envelope) return plain;
    // SecretEnvelope writes `v2.…`; the AAD is what makes it v3.
    const inner = this.envelope.encrypt(plain, aadV3(messageId));
    return `${PREFIX}${V3}${inner.slice(inner.indexOf('.'))}`;
  }

  open(stored: string, messageId: string): string {
    if (!SEALED.test(stored)) return stored;
    const body = stored.slice(PREFIX.length);
    const version = body.slice(0, 2);
    const kid = SecretEnvelope.kidOf(body);
    if (!this.envelope) {
      // Never hand ciphertext to a client: the keys are missing here.
      this.logger.error(
        `Encrypted message body but MESSAGE_ENC_KEYS unset (message ${messageId}, key ${kid})`,
      );
      return '';
    }
    try {
      return version === V3
        ? this.envelope.decrypt(`v2${body.slice(2)}`, aadV3(messageId))
        : this.envelope.decrypt(body, AAD_V2);
    } catch {
      // A key removed too early, a ciphertext moved to another row, or a
      // tampered one. Loud, without any text; the client gets ''.
      this.logger.warn(
        `Message body failed to decrypt (message ${messageId}, ${version}, key ${kid})`,
      );
      return '';
    }
  }
}
