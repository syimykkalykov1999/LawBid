import { randomUUID } from 'node:crypto';
import {
  LOGICAL_SHARDS,
  hashShard,
  isShardedId,
  newShardedId,
  shardOf,
  timestampOf,
} from './shard-id';

const UUID_V8_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newShardedId', () => {
  it('is a valid RFC 9562 version-8 uuid (version and variant bits)', () => {
    for (let i = 0; i < 1000; i++) {
      const id = newShardedId(i % 256);
      expect(id).toMatch(UUID_V8_RE);
      expect(isShardedId(id)).toBe(true);
    }
  });

  it('round-trips every logical shard 0..4095 through shardOf', () => {
    for (let s = 0; s <= 4095; s++) {
      expect(shardOf(newShardedId(s))).toBe(s);
    }
  });

  it('rejects an out-of-range or non-integer shard', () => {
    expect(() => newShardedId(-1)).toThrow(RangeError);
    expect(() => newShardedId(4096)).toThrow(RangeError);
    expect(() => newShardedId(1.5)).toThrow(RangeError);
    expect(() => newShardedId(NaN)).toThrow(RangeError);
  });

  it('embeds the timestamp and sorts by time', () => {
    const t = 1_800_000_000_000;
    expect(timestampOf(newShardedId(7, t))).toBe(t);
    const a = newShardedId(7, t);
    const b = newShardedId(7, t + 1);
    const c = newShardedId(7, t + 5000);
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it('never lets the timestamp go backwards in a process', () => {
    const t = 1_900_000_000_000;
    const first = newShardedId(1, t);
    const later = newShardedId(1, t - 10_000);
    expect(timestampOf(later)!).toBeGreaterThanOrEqual(timestampOf(first)!);
  });

  it('timestamps of a run of ids are non-decreasing', () => {
    let prev = 0;
    for (let i = 0; i < 20_000; i++) {
      const ts = timestampOf(newShardedId(3))!;
      expect(ts).toBeGreaterThanOrEqual(prev);
      prev = ts;
    }
  });

  it('is accepted by the uuid column shape: lower-case, 36 chars', () => {
    const id = newShardedId(255);
    expect(id).toHaveLength(36);
    expect(id).toBe(id.toLowerCase());
  });

  it('has no collisions in 1,000,000 ids of one shard', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000_000; i++) seen.add(newShardedId(42));
    expect(seen.size).toBe(1_000_000);
  });

  it('has no collisions in 1,000,000 ids spread across all 256 shards', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000_000; i++) seen.add(newShardedId(i % 256));
    expect(seen.size).toBe(1_000_000);
  });
});

describe('shardOf / hashShard on legacy v4 ids', () => {
  it('is not a sharded id and falls back to the hash of the id', () => {
    for (let i = 0; i < 500; i++) {
      const id = randomUUID();
      expect(isShardedId(id)).toBe(false);
      expect(shardOf(id)).toBe(hashShard(id));
      expect(shardOf(id)).toBeGreaterThanOrEqual(0);
      expect(shardOf(id)).toBeLessThan(LOGICAL_SHARDS);
    }
  });

  it('hashShard is the last byte (matches the SQL backfill)', () => {
    expect(hashShard('00000000-0000-4000-8000-0000000000ab')).toBe(0xab);
    expect(hashShard('00000000-0000-4000-8000-000000000000')).toBe(0);
    expect(hashShard('00000000-0000-4000-8000-0000000000FF')).toBe(255);
  });

  it('spreads random v4 ids roughly evenly over 256 shards', () => {
    const counts = new Array<number>(LOGICAL_SHARDS).fill(0);
    const n = 256_000;
    for (let i = 0; i < n; i++) counts[hashShard(randomUUID())]++;
    const expected = n / LOGICAL_SHARDS;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.8);
      expect(c).toBeLessThan(expected * 1.2);
    }
  });

  it('timestampOf is null for a v4 id', () => {
    expect(timestampOf(randomUUID())).toBeNull();
  });

  it('throws on a non-uuid', () => {
    expect(() => shardOf('nope')).toThrow(TypeError);
    expect(() => hashShard('')).toThrow(TypeError);
    expect(isShardedId('nope')).toBe(false);
  });
});
