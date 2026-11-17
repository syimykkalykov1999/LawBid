import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Detective R2B-14 (14.11): the unsubscribe link in a cold email is a
 * SIGNED token, not a secret kept in the database. Format
 * `u1.<kid>.<lead id, 16 bytes base64url>.<HMAC-SHA256, 16 bytes base64url>`.
 *
 * Keys: the existing secrets key ring SECRETS_MASTER_KEYS ("kid:secret,…",
 * SECRETS_ACTIVE_KID signs, every listed kid verifies — rotation keeps the
 * links already sent working). Each key is narrowed to this one purpose
 * (HMAC(key, "outreach-unsubscribe:v1")), so the token never reveals or
 * reuses the envelope key. Same sign/verify shape as the deletion-cancel
 * link (privacy/deletion-notices.service.ts).
 *
 * Links sent before this change carry the old random token; the database
 * keeps only its sha256 (`unsubscribe_token_hash`), see [hashLegacyToken].
 */
export const UNSUBSCRIBE_TOKEN_VERSION = 'u1';
const PURPOSE = 'outreach-unsubscribe:v1';
const MAC_BYTES = 16;

/** Any token shape we accept in the URL: signed (`u1.…`) or legacy. */
export const UNSUBSCRIBE_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{16,120}$/;

/** sha256 hex of an old random token — what the database keeps now. */
export function hashLegacyToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function uuidToB64(id: string): string | null {
  const hex = id.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return Buffer.from(hex, 'hex').toString('base64url');
}

function b64ToUuid(b64: string): string | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64url');
  } catch {
    return null;
  }
  if (buf.length !== 16 || buf.toString('base64url') !== b64) return null;
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class UnsubscribeTokenCodec {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    rawKeys: string,
    readonly activeKid: string,
  ) {
    for (const pair of rawKeys.split(',')) {
      const i = pair.indexOf(':');
      const kid = pair.slice(0, i).trim();
      const secret = pair.slice(i + 1);
      if (!kid || !/^[A-Za-z0-9_-]+$/.test(kid) || secret.length < 32) {
        throw new Error(
          'SECRETS_MASTER_KEYS: each key needs a kid and >= 32 chars',
        );
      }
      this.keys.set(kid, createHmac('sha256', secret).update(PURPOSE).digest());
    }
    if (!this.keys.has(activeKid)) {
      throw new Error('SECRETS_ACTIVE_KID is not in SECRETS_MASTER_KEYS');
    }
  }

  /** The ring from the environment, or null when it is not set (dev). */
  static from(
    rawKeys: string | undefined,
    activeKid: string | undefined,
  ): UnsubscribeTokenCodec | null {
    if (!rawKeys || !activeKid) return null;
    try {
      return new UnsubscribeTokenCodec(rawKeys, activeKid);
    } catch {
      return null;
    }
  }

  private mac(kid: string, idB64: string): Buffer | null {
    const key = this.keys.get(kid);
    if (!key) return null;
    return createHmac('sha256', key)
      .update(`${UNSUBSCRIBE_TOKEN_VERSION}.${kid}.${idB64}`)
      .digest()
      .subarray(0, MAC_BYTES);
  }

  /** The link token of a lead, signed with the active key. */
  sign(leadId: string): string {
    const idB64 = uuidToB64(leadId);
    if (!idB64) throw new Error('lead id is not a uuid');
    const mac = this.mac(this.activeKid, idB64)!;
    return [
      UNSUBSCRIBE_TOKEN_VERSION,
      this.activeKid,
      idB64,
      mac.toString('base64url'),
    ].join('.');
  }

  /** The lead id of a valid signed token, else null (forged, unknown kid,
   * another format). Constant-time MAC compare. */
  verify(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== UNSUBSCRIBE_TOKEN_VERSION) {
      return null;
    }
    const [, kid, idB64, sigB64] = parts;
    const want = this.mac(kid, idB64);
    if (!want) return null;
    let got: Buffer;
    try {
      got = Buffer.from(sigB64, 'base64url');
    } catch {
      return null;
    }
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    return b64ToUuid(idB64);
  }
}

/** Is [token] in the signed format (whatever its key)? */
export function isSignedUnsubscribeToken(token: string): boolean {
  return token.startsWith(`${UNSUBSCRIBE_TOKEN_VERSION}.`);
}
