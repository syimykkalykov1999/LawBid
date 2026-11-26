import { createHash } from 'node:crypto';
import type Redis from 'ioredis';

/**
 * Third pass M12 (owner 26.11: the text of an end-to-end encrypted message
 * in its push, like WhatsApp / Signal). Each phone makes its own
 * push-preview key pair (X25519) and sends only the public half with its
 * push token. The SENDER seals a short preview to every recipient device
 * with HPKE (RFC 9180, base mode, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256,
 * ChaCha20-Poly1305) and sends the sealed blobs next to the MLS message.
 * The server never sees the text: it keeps the blobs a short while and
 * puts each device's blob (`data.pp`) into that device's push. The phone's
 * push extension opens it with the platform's crypto (CryptoKit HPKE on
 * iOS 17+, Tink HPKE on Android); anything else shows «Новое сообщение».
 */

/** A raw X25519 public key, base64 (32 bytes). */
export const PUSH_PREVIEW_KEY_B64_LEN = 44;

/** A key's id: base64url of the first 12 bytes of SHA-256(key), 16 chars. */
export const PUSH_PREVIEW_KID_LEN = 16;

/** One sealed preview (enc 32 + text ≤ ~600 bytes + tag 16), base64. */
export const PUSH_PREVIEW_CT_MAX_B64 = 1024;

/** Devices one message may carry previews for (10 per user × members). */
export const PUSH_PREVIEWS_MAX = 64;

/** The blobs outlive quiet hours (a push can be held until morning). */
export const PUSH_PREVIEW_TTL_SEC = 2 * 24 * 3600;

export function pushPreviewKid(keyB64: string): string {
  const raw = Buffer.from(keyB64, 'base64');
  return createHash('sha256')
    .update(raw)
    .digest()
    .subarray(0, 12)
    .toString('base64url');
}

/** True for a base64 raw 32-byte key. */
export function isPushPreviewKey(keyB64: string | null | undefined): boolean {
  if (!keyB64 || keyB64.length !== PUSH_PREVIEW_KEY_B64_LEN) return false;
  return Buffer.from(keyB64, 'base64').length === 32;
}

const redisKey = (messageId: string) => `push:pp:${messageId}`;

/** Keeps the sealed previews of [messageId] (kid → ciphertext). Never
 * throws: a message always goes, at worst its push says «Новое сообщение». */
export async function storePushPreviews(
  redis: Redis | undefined,
  messageId: string,
  previews: { kid: string; ct: string }[] | undefined,
): Promise<void> {
  if (!redis || !previews || previews.length === 0) return;
  try {
    const map: Record<string, string> = {};
    for (const p of previews.slice(0, PUSH_PREVIEWS_MAX)) map[p.kid] = p.ct;
    await redis.set(
      redisKey(messageId),
      JSON.stringify(map),
      'EX',
      PUSH_PREVIEW_TTL_SEC,
    );
  } catch {
    // Redis down: the push carries no preview.
  }
}

/** The sealed previews of [messageId] (empty when none / Redis down). */
export async function loadPushPreviews(
  redis: Redis | undefined,
  messageId: string,
): Promise<Record<string, string>> {
  if (!redis) return {};
  try {
    const raw = await redis.get(redisKey(messageId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length <= PUSH_PREVIEW_CT_MAX_B64) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}
