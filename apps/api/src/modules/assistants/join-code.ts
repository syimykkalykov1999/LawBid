import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'node:crypto';
import { SecretEnvelope } from '../../common/secrets/secret-envelope';

/**
 * Owner 2026-10-04: an assistant joins the attorney's team — and signs in
 * again on a new phone — with a one-time code the attorney sees in the app
 * (Team / Subscription → "Your assistant and their code"). No SMS.
 *
 * - One code per seat (membership). "Add assistant" makes a new one;
 *   "New code" replaces it; removing the assistant voids it.
 * - 12 symbols from a 31-letter alphabet without look-alikes (~59 bits):
 *   globally unique (unique index on the hash), not guessable, and the
 *   sign-in endpoint is rate limited. Shown as XXXX-XXXX-XXXX.
 * - Used once: redeeming clears it. Valid for 7 days.
 * - Stored as sha256 (lookup) and AES-GCM encrypted (the attorney can show
 *   and copy it again until it is used).
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const JOIN_CODE_LENGTH = 12;
export const JOIN_CODE_TTL_MS = 7 * 24 * 3600 * 1000;

export function newJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Upper-cased, without spaces and dashes (what the assistant typed). */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function formatJoinCode(code: string): string {
  return (
    normalizeJoinCode(code)
      .match(/.{1,4}/g)
      ?.join('-') ?? ''
  );
}

export function hashJoinCode(code: string): string {
  return createHash('sha256')
    .update(`assistant-join:${normalizeJoinCode(code)}`)
    .digest('hex');
}

const PLAIN = 'plain:';

/** Encrypts the code with SECRETS_MASTER_KEYS (local dev without keys
 * keeps it readable, like the other secret stores). */
@Injectable()
export class JoinCodeCipher {
  private readonly logger = new Logger(JoinCodeCipher.name);
  private readonly envelope: SecretEnvelope | null;

  constructor(config: ConfigService) {
    const keys = config.get<string>('SECRETS_MASTER_KEYS');
    const kid = config.get<string>('SECRETS_ACTIVE_KID');
    this.envelope = keys && kid ? new SecretEnvelope(keys, kid) : null;
  }

  seal(code: string, membershipId: string): string {
    return this.envelope
      ? this.envelope.encrypt(code, aad(membershipId))
      : PLAIN + code;
  }

  open(stored: string, membershipId: string): string | null {
    if (stored.startsWith(PLAIN)) return stored.slice(PLAIN.length);
    if (!this.envelope) return null;
    try {
      return this.envelope.decrypt(stored, aad(membershipId));
    } catch {
      this.logger.warn('An assistant join code could not be decrypted');
      return null;
    }
  }
}

function aad(membershipId: string): string {
  return `assistant_memberships.join_code:${membershipId}`;
}
