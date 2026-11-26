import { createHash } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * M12 (owner 26.11 «в уведомлениях будет текст, как в WhatsApp»): the text
 * of an end-to-end encrypted (MLS) message in its push, which the server
 * never reads.
 *
 * Every phone makes its own push-preview key pair (X25519) on the device and
 * registers the public half next to its push token (`push_tokens.
 * preview_key`). The sender's app HPKE-seals (RFC 9180: DHKEM X25519,
 * HKDF-SHA256, ChaCha20Poly1305, Tink's NO_PREFIX format) a short preview
 * to each recipient device and sends the sealed blobs with the message,
 * each under the [pushPreviewKeyId] of its key. The server keeps them only
 * in the push job and puts the matching one into each device's push
 * (`data.sealed`); the iPhone's notification extension / the Android
 * receiver open it. No match, an older app or any failure on the phone:
 * the push says «Новое сообщение», as before.
 */

/** An X25519 public key is 32 bytes. */
export const PREVIEW_KEY_BYTES = 32;

/** The most sealed previews one message may carry (≈ 3 people × 10
 * devices; push-tokens MAX_DEVICES is 10 per person). */
export const MAX_PUSH_PREVIEWS = 32;

/** The longest sealed preview (base64): 32-byte enc + ≤ 120 characters of
 * text as JSON + 16-byte tag stays well under it; APNs / FCM allow 4 KB
 * for the whole push. */
export const MAX_SEALED_PREVIEW_B64 = 1400;

/** A key's id as senders and the server name it: the first 12 bytes of
 * its SHA-256, base64url (16 characters). Never the push token itself
 * (a token is an address; a sender must not learn it). */
export function pushPreviewKeyId(key: Uint8Array): string {
  return createHash('sha256')
    .update(key)
    .digest()
    .subarray(0, 12)
    .toString('base64url');
}

/** base64 → the 32 key bytes, or null for anything else. */
export function parsePreviewKey(b64: string | undefined | null): Buffer | null {
  if (!b64) return null;
  const key = Buffer.from(b64, 'base64');
  return key.length === PREVIEW_KEY_BYTES ? key : null;
}

/** The previews a send carried, as the push job keeps them (key id →
 * sealed base64), or undefined when there are none. */
export function sealedPreviewMap(
  previews: { keyId: string; sealed: string }[] | undefined | null,
): Record<string, string> | undefined {
  if (!previews?.length) return undefined;
  const out: Record<string, string> = {};
  for (const p of previews.slice(0, MAX_PUSH_PREVIEWS)) {
    out[p.keyId] = p.sealed;
  }
  return out;
}

/** One device key a sender seals to. */
export interface PushPreviewKey {
  userId: string;
  keyId: string;
  /** base64, 32 bytes. */
  publicKey: string;
}

/** The push-preview keys of [userIds]' phones, newest devices first, at
 * most [perUser] each (push-tokens MAX_DEVICES). One read by user id. */
export async function readPreviewKeys(
  prisma: Pick<PrismaService, 'pushToken'>,
  userIds: string[],
  perUser = 10,
): Promise<PushPreviewKey[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.pushToken.findMany({
    where: {
      user_id: { in: userIds },
      platform: { in: ['ios', 'android'] },
      preview_key: { not: null },
    },
    orderBy: { last_seen_at: 'desc' },
    take: userIds.length * perUser,
    select: { user_id: true, preview_key: true },
  });
  const count = new Map<string, number>();
  const seen = new Set<string>();
  const out: PushPreviewKey[] = [];
  for (const r of rows) {
    if (!r.preview_key || r.preview_key.length !== PREVIEW_KEY_BYTES) continue;
    const n = count.get(r.user_id) ?? 0;
    if (n >= perUser || out.length >= MAX_PUSH_PREVIEWS) continue;
    const keyId = pushPreviewKeyId(r.preview_key);
    if (seen.has(keyId)) continue;
    seen.add(keyId);
    count.set(r.user_id, n + 1);
    out.push({
      userId: r.user_id,
      keyId,
      publicKey: Buffer.from(r.preview_key).toString('base64'),
    });
  }
  return out;
}
