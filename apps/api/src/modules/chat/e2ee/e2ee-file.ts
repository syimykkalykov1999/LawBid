import { createDecipheriv } from 'node:crypto';

/**
 * Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §5): the format of
 * a file the phone encrypts — the segmented ("online") AEAD construction of
 * Google Tink's AES-GCM-HKDF streaming (Hoang, Reyhanitabar, Rogaway,
 * Vizár 2015), used as an idea (Tink has no Dart port):
 *
 *   "LBE1" | nonce prefix (7 bytes) | segment 0 | segment 1 | …
 *   segment i = AES-256-GCM(key, nonce = prefix || u32be(i) || last, data)
 *               (≤ 64 KiB of plaintext + 16-byte tag; last = 1 on the final)
 *
 * The key (32 random bytes) and the SHA-256 of the ciphertext travel inside
 * the MLS message. The server decrypts a file only when a report hands it
 * the key (antivirus and moderation of the reported file).
 */
export const E2EE_FILE_MAGIC = 'LBE1';
export const E2EE_SEGMENT = 64 * 1024;
const TAG = 16;
const HEADER = 4 + 7;

export function decryptE2eeFile(blob: Buffer, key: Buffer): Buffer {
  if (
    blob.length < HEADER + TAG ||
    blob.subarray(0, 4).toString('latin1') !== E2EE_FILE_MAGIC
  ) {
    throw new Error('not an encrypted LawBid file');
  }
  if (key.length !== 32) throw new Error('the key is 32 bytes');
  const prefix = blob.subarray(4, HEADER);
  const out: Buffer[] = [];
  let at = HEADER;
  for (let i = 0; at < blob.length; i++) {
    const end = Math.min(at + E2EE_SEGMENT + TAG, blob.length);
    const last = end === blob.length;
    const seg = blob.subarray(at, end);
    const nonce = Buffer.alloc(12);
    prefix.copy(nonce, 0);
    nonce.writeUInt32BE(i, 7);
    nonce[11] = last ? 1 : 0;
    const d = createDecipheriv('aes-256-gcm', key, nonce);
    d.setAuthTag(seg.subarray(seg.length - TAG));
    out.push(d.update(seg.subarray(0, seg.length - TAG)), d.final());
    at = end;
  }
  return Buffer.concat(out);
}
