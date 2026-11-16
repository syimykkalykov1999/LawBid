import { createHash } from 'node:crypto';

/** RFC 4122 §4.3 name-based UUID (version 5, SHA-1) — the algorithm of the
 * `uuid` package's v5 (MIT), so one name always maps to one id. Used for
 * ids that must be the same on every retry (a brief file per bid, a refund
 * row per Idempotency-Key). */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
    .digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
