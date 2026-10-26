import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { readKey } from './key-holder';
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
/** Marks a sealed metadata field (file name, private details, journal
 * text); the AAD (`<table.column>:<row id>`) is supplied by the caller. */
const FIELD_PREFIX = 'encf:';
const SEALED_FIELD = /^encf:v2\.[\w-]+\.[\w-]+\.[\w-]+\.[\w-]*$/;
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

  constructor(
    config: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    const keys = readKey('MESSAGE_ENC_KEYS', () =>
      config.get<string>('MESSAGE_ENC_KEYS'),
    );
    const kid = config.get<string>('MESSAGE_ENC_ACTIVE_KID');
    this.envelope = keys && kid ? new SecretEnvelope(keys, kid) : null;
  }

  get enabled(): boolean {
    return this.envelope !== null;
  }

  /** The kid new rows are sealed with (null without keys). */
  get activeKid(): string | null {
    return this.envelope?.activeKid ?? null;
  }

  /** Every kid the process can open (active + retired), sorted. */
  get kids(): string[] {
    return this.envelope ? [...this.envelope.kids].sort() : [];
  }

  /** True for a sealed body (either version). */
  static isSealed(stored: string): boolean {
    return SEALED.test(stored);
  }

  /** The key id a sealed body was written with (null for plaintext). */
  static kidOf(stored: string): string | null {
    return SEALED.test(stored)
      ? SecretEnvelope.kidOf(stored.slice(PREFIX.length))
      : null;
  }

  /**
   * Owner 2026-10-22 (re-encryption job): a sealed body that is still
   * `enc:v2…` (constant AAD) or sits under a retired key id needs to be
   * rewritten as v3 under the active key. Plaintext rows (system keys,
   * `[deleted]`, demo text, '') are never touched.
   */
  needsReseal(stored: string): boolean {
    if (!this.envelope || !SEALED.test(stored)) return false;
    const body = stored.slice(PREFIX.length);
    return (
      body.slice(0, 2) !== V3 ||
      SecretEnvelope.kidOf(body) !== this.envelope.activeKid
    );
  }

  /**
   * Rewrites a body that `needsReseal`; null when it cannot be opened (a
   * key already gone, a moved or tampered ciphertext) — the caller counts
   * it, nothing about the text is logged here.
   */
  reseal(stored: string, messageId: string): string | null {
    if (!this.envelope || !SEALED.test(stored)) return null;
    const body = stored.slice(PREFIX.length);
    try {
      const plain =
        body.slice(0, 2) === V3
          ? this.envelope.decrypt(`v2${body.slice(2)}`, aadV3(messageId))
          : this.envelope.decrypt(body, AAD_V2);
      return this.seal(plain, messageId);
    } catch {
      return null;
    }
  }

  // --- sealed metadata fields (S3-5) -----------------------------------------
  // `encf:v2.<kid>.<iv>.<tag>.<ct>` with a caller-supplied AAD that names the
  // column and the row (`messages.file_name:<id>`), so a value copied to
  // another row fails to open. Legacy plaintext stays readable.

  /** True for a sealed metadata field. */
  static isFieldSealed(stored: string): boolean {
    return SEALED_FIELD.test(stored);
  }

  /** The key id of a sealed field (null for plaintext). */
  static fieldKidOf(stored: string): string | null {
    return SEALED_FIELD.test(stored)
      ? SecretEnvelope.kidOf(stored.slice(FIELD_PREFIX.length))
      : null;
  }

  /** New file names and case private details: sealed unless the admin
   * switched `security.seal_case_metadata` off (plaintext without keys). */
  async sealMetadata(plain: string, aad: string): Promise<string> {
    if (!this.envelope) return plain;
    if (
      this.settings &&
      !(await this.settings.boolean('security.seal_case_metadata'))
    ) {
      return plain;
    }
    return this.sealField(plain, aad);
  }

  /** Case-journal free text: sealed only when `security.seal_journal_text`
   * is on (the journal cannot be rewritten later). */
  async sealJournalText(plain: string, aad: string): Promise<string> {
    if (!this.envelope || !this.settings) return plain;
    if (!(await this.settings.boolean('security.seal_journal_text'))) {
      return plain;
    }
    return this.sealField(plain, aad);
  }

  /** Seals [plain] under the active key; plaintext without keys. */
  sealField(plain: string, aad: string): string {
    if (!this.envelope) return plain;
    return `${FIELD_PREFIX}${this.envelope.encrypt(plain, aad)}`;
  }

  /** Opens a sealed field; a plaintext value passes through. A value that
   * cannot be opened reads as '' (logged without any text). */
  openField(stored: string, aad: string): string {
    if (!SEALED_FIELD.test(stored)) return stored;
    const kid = SecretEnvelope.kidOf(stored.slice(FIELD_PREFIX.length));
    if (!this.envelope) {
      this.logger.error(
        `Sealed field but MESSAGE_ENC_KEYS unset (${aad.split(':')[0]}, key ${kid})`,
      );
      return '';
    }
    try {
      return this.envelope.decrypt(stored.slice(FIELD_PREFIX.length), aad);
    } catch {
      this.logger.warn(
        `Sealed field failed to decrypt (${aad.split(':')[0]}, key ${kid})`,
      );
      return '';
    }
  }

  /** Backfill / rotation: a plaintext value, or one under a retired kid. */
  fieldNeedsWrite(stored: string): boolean {
    if (!this.envelope) return false;
    if (!SEALED_FIELD.test(stored)) return stored.length > 0;
    return (
      SecretEnvelope.kidOf(stored.slice(FIELD_PREFIX.length)) !==
      this.envelope.activeKid
    );
  }

  /** Re-seals [stored] (plaintext or any known kid) under the active key;
   * null when it cannot be opened. */
  resealField(stored: string, aad: string): string | null {
    if (!this.envelope) return null;
    if (!SEALED_FIELD.test(stored)) return this.sealField(stored, aad);
    try {
      const plain = this.envelope.decrypt(
        stored.slice(FIELD_PREFIX.length),
        aad,
      );
      return this.sealField(plain, aad);
    } catch {
      return null;
    }
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
