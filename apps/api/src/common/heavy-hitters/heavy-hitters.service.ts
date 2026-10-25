import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** What is counted. */
export const HEAVY_METRICS = [
  'requests',
  'db_ms',
  'upload_bytes',
  'messages',
] as const;
export type HeavyMetric = (typeof HEAVY_METRICS)[number];
export type HeavySubject = 'user' | 'case';

export interface HeavyEntry {
  id: string;
  score: number;
}

/**
 * Owner 2026-10-25 (WP-G): who and which case loads the system the most,
 * WITHOUT one CloudWatch label per user (a per-user metric dimension costs
 * $0.30 per metric per month and explodes the bill).
 *
 * What was checked first: RedisBloom TopK is NOT available on ElastiCache
 * (AWS ships Bloom filters in ElastiCache for Valkey 8.1, July 2025; no
 * TopK), so this uses the standard Redis pattern: a sorted set per
 * 5-minute bucket, summed over the window on read (ZUNIONSTORE), each
 * bucket capped to its biggest members (ZREMRANGEBYRANK) and expiring by
 * itself. That is a sliding window with decay for free: old buckets simply
 * fall out.
 *
 * Cheap on purpose:
 *  - HTTP requests and their database time are SAMPLED (1 in
 *    HEAVY_HITTERS_SAMPLE, default 10; the weight is multiplied back so the
 *    totals stay unbiased). Messages and upload bytes are exact.
 *  - Counts are added up in this process and flushed every 5 s as ONE Lua
 *    call per (metric, subject): about eight Redis commands per 5 s per
 *    container, however busy the API is.
 *  - Memory: 4 metrics x 2 subjects x 12 buckets x 500 members, a few MB.
 *  - Redis down: counts are dropped, requests are never slowed or failed.
 *
 * Cluster-safe: every key carries the hash tag `{hh}`, so the multi-key Lua
 * scripts stay in one slot (docs/architecture/REDIS_AUTOSCALE.md).
 * HEAVY_HITTERS_SAMPLE=0 switches it off.
 */
const BUCKET_SEC = 300;
const MEMBER_CAP = 500;
const FLUSH_MS = 5000;
const MAX_PENDING = 5000;

const ADD_LUA = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
for i = 3, #ARGV, 2 do
  redis.call('ZINCRBY', key, ARGV[i], ARGV[i + 1])
end
redis.call('EXPIRE', key, ttl)
local n = redis.call('ZCARD', key)
if n > cap then
  redis.call('ZREMRANGEBYRANK', key, 0, n - cap - 1)
end
return n
`;

const TOP_LUA = `
local n = tonumber(ARGV[1])
local keys = {}
for i = 2, #KEYS do keys[#keys + 1] = KEYS[i] end
redis.call('ZUNIONSTORE', KEYS[1], #keys, unpack(keys))
redis.call('EXPIRE', KEYS[1], 10)
local out = redis.call('ZREVRANGE', KEYS[1], 0, n - 1, 'WITHSCORES')
redis.call('DEL', KEYS[1])
return out
`;

@Injectable()
export class HeavyHittersService implements OnApplicationShutdown {
  private readonly pending = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private readonly sampleEvery: number;
  private readonly windowBuckets: number;
  /** Redis key prefix; the `{hh}` hash tag keeps all keys in one cluster slot. */
  prefix = '{hh}';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() config?: ConfigService,
  ) {
    const sample = Number(config?.get('HEAVY_HITTERS_SAMPLE') ?? 10);
    this.sampleEvery = Number.isFinite(sample) && sample >= 0 ? sample : 10;
    const minutes = Number(config?.get('HEAVY_HITTERS_WINDOW_MIN') ?? 60);
    this.windowBuckets = Math.max(
      1,
      Math.min(288, Math.round((minutes * 60) / BUCKET_SEC) || 12),
    );
  }

  get enabled(): boolean {
    return this.sampleEvery > 0;
  }

  /** Window length in minutes (for the admin card). */
  get windowMinutes(): number {
    return (this.windowBuckets * BUCKET_SEC) / 60;
  }

  /** True for one request in `sampleEvery`. */
  shouldSample(): boolean {
    if (!this.enabled) return false;
    return this.sampleEvery === 1 || Math.random() * this.sampleEvery < 1;
  }

  /** Weight to multiply a sampled count by. */
  get sampleWeight(): number {
    return Math.max(1, this.sampleEvery);
  }

  private bucketKey(
    metric: HeavyMetric,
    subject: HeavySubject,
    bucket: number,
  ): string {
    return `${this.prefix}:${metric}:${subject}:${bucket}`;
  }

  private currentBucket(now = Date.now()): number {
    return Math.floor(now / 1000 / BUCKET_SEC);
  }

  /** Adds [weight] to [id]'s score. Never throws, never waits for Redis. */
  record(
    metric: HeavyMetric,
    subject: HeavySubject,
    id: string | null | undefined,
    weight: number,
  ): void {
    if (!this.enabled || !id || !(weight > 0)) return;
    const k = `${metric}|${subject}|${id}`;
    if (!this.pending.has(k) && this.pending.size >= MAX_PENDING) return;
    this.pending.set(k, (this.pending.get(k) ?? 0) + weight);
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, FLUSH_MS).unref();
  }

  /** A chat message sent (exact). */
  message(userId: string, caseId?: string | null): void {
    this.record('messages', 'user', userId, 1);
    this.record('messages', 'case', caseId, 1);
  }

  /** A confirmed upload (exact). */
  upload(userId: string, bytes: number, caseId?: string | null): void {
    this.record('upload_bytes', 'user', userId, bytes);
    this.record('upload_bytes', 'case', caseId, bytes);
  }

  /** Writes what has been counted so far (one Lua call per metric+subject). */
  async flush(now = Date.now()): Promise<void> {
    if (this.pending.size === 0) return;
    const groups = new Map<string, string[]>();
    for (const [k, w] of this.pending) {
      const [metric, subject, id] = k.split('|');
      const g = `${metric}|${subject}`;
      const list = groups.get(g) ?? [];
      list.push(String(w), id);
      groups.set(g, list);
    }
    this.pending.clear();
    const bucket = this.currentBucket(now);
    const ttl = (this.windowBuckets + 2) * BUCKET_SEC;
    try {
      const pipe = this.redis.pipeline();
      for (const [g, args] of groups) {
        const [metric, subject] = g.split('|') as [HeavyMetric, HeavySubject];
        pipe.eval(
          ADD_LUA,
          1,
          this.bucketKey(metric, subject, bucket),
          String(ttl),
          String(MEMBER_CAP),
          ...args,
        );
      }
      await pipe.exec();
    } catch {
      // Observability only: a Redis hiccup loses a few counts, nothing else.
    }
  }

  /** The [n] heaviest ids of [metric] over the window, biggest first. */
  async top(
    metric: HeavyMetric,
    subject: HeavySubject,
    n = 20,
    now = Date.now(),
  ): Promise<HeavyEntry[]> {
    await this.flush(now);
    const current = this.currentBucket(now);
    const keys: string[] = [`${this.prefix}:tmp:${metric}:${subject}`];
    for (let i = 0; i < this.windowBuckets; i++) {
      keys.push(this.bucketKey(metric, subject, current - i));
    }
    const raw = (await this.redis.eval(
      TOP_LUA,
      keys.length,
      ...keys,
      String(n),
    )) as string[];
    const out: HeavyEntry[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      out.push({ id: raw[i], score: Math.round(Number(raw[i + 1])) });
    }
    return out;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.flush();
  }
}
