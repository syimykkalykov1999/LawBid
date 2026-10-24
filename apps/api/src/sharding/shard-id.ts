import { randomFillSync } from 'node:crypto';

/**
 * Shard-ready step 1 (docs/architecture/SHARDING_READY.md §4): UUIDv8 ids
 * that carry their logical shard.
 *
 *   bytes 0-5   48-bit unix time in ms (big endian)  -> time ordered
 *   byte  6     version 8 (high nibble) | shard bits 11..8
 *   byte  7     shard bits 7..0
 *   byte  8     RFC 9562 variant `10` | 6 random bits
 *   bytes 9-15  56 random bits
 *
 * 12 shard bits give 4096 logical shards; LawBid uses 256
 * (`LOGICAL_SHARDS`). The column type stays `uuid`; the version/variant
 * bits are valid per RFC 9562, so Postgres and every client accept them.
 *
 * Legacy rows keep their random v4 ids. `shardOf` on a v4 id falls back to
 * `hashShard(id)`: the last id byte, which is uniformly random in v4. The
 * SQL backfill of `shard_id` computes the same function.
 */
export const LOGICAL_SHARDS = 256;
export const MAX_SHARD_BITS = 0xfff;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{12}$/i;

const POOL_SIZE = 4096;
const pool = Buffer.alloc(POOL_SIZE);
let poolOffset = POOL_SIZE;
let lastMs = 0;

function random(n: number): Buffer {
  if (poolOffset + n > POOL_SIZE) {
    randomFillSync(pool);
    poolOffset = 0;
  }
  const out = pool.subarray(poolOffset, poolOffset + n);
  poolOffset += n;
  return out;
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);

/**
 * A new UUIDv8 carrying `shard` (0..4095). The timestamp never goes
 * backwards inside a process even if the wall clock does. `nowMs` is for
 * tests.
 */
export function newShardedId(
  shard: number,
  nowMs: number = Date.now(),
): string {
  if (!Number.isInteger(shard) || shard < 0 || shard > MAX_SHARD_BITS) {
    throw new RangeError(`shard must be an integer in 0..4095, got ${shard}`);
  }
  const ms = Math.max(Math.floor(nowMs), lastMs);
  lastMs = ms;
  const b = Buffer.alloc(16);
  // 48-bit big-endian timestamp (ms < 2^48 until the year 10889).
  b.writeUIntBE(ms, 0, 6);
  b[6] = 0x80 | ((shard >> 8) & 0x0f);
  b[7] = shard & 0xff;
  const r = random(8);
  b[8] = 0x80 | (r[0] & 0x3f);
  r.copy(b, 9, 1, 8);
  const h = b.reduce((s, x) => s + HEX[x], '');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function parts(id: string): { version: number; variant: number } {
  const m = UUID_RE.exec(id);
  if (!m) throw new TypeError(`not a UUID: ${String(id)}`);
  return { version: parseInt(m[1], 16), variant: parseInt(m[2], 16) };
}

/** True for an id made by `newShardedId` (version 8, RFC variant). */
export function isShardedId(id: string): boolean {
  const m = UUID_RE.exec(id);
  if (!m) return false;
  return parseInt(m[1], 16) === 8 && (parseInt(m[2], 16) & 0xc) === 0x8;
}

/** Deterministic shard for an owning key (a user id): its last byte. */
export function hashShard(ownerId: string): number {
  parts(ownerId);
  return parseInt(ownerId.slice(-2), 16) % LOGICAL_SHARDS;
}

/**
 * The logical shard of an id: the embedded 12 bits for a sharded id; for a
 * legacy v4 (or any other) uuid, `hashShard(id)`.
 */
export function shardOf(id: string): number {
  if (isShardedId(id)) return parseInt(id.slice(15, 18), 16);
  return hashShard(id);
}

/** Creation time embedded in a sharded id (ms), or null for other uuids. */
export function timestampOf(id: string): number | null {
  if (!isShardedId(id)) return null;
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
