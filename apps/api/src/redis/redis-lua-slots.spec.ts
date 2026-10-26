// No real connection in this spec: bullOptions() in cluster mode would
// create an ioredis Cluster that retries forever against a non-cluster Redis.
jest.mock('ioredis', () => {
  class Fake {
    options = {};
    on() {
      return this;
    }
    disconnect() {}
    quit() {
      return Promise.resolve('OK');
    }
  }
  return { __esModule: true, default: Fake, Cluster: Fake };
});
jest.setTimeout(20_000);

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ck, keySlot } from './redis-cluster-safe';
import { bullOptions } from './redis-connection';
import {
  moneyCounterKey,
  costCounterKey,
} from '../common/cost-guard/cost-guard.service';
import { COST_WINDOWS } from '../common/cost-guard/cost-guard.constants';
import {
  COUNTER_SHARDS,
  pendingKey,
  touchedKey,
} from '../modules/counters/counter-aggregator.service';

/**
 * S6-5: CI guard for Redis Cluster safety of every Lua script and of the key
 * families scripts touch, with NO real cluster: slots are computed statically
 * (CRC16, same as Redis) and mapped onto a 3-shard topology like an
 * ElastiCache group with three node groups (0-5460, 5461-10922, 10923-16383).
 *
 * 1. Static: inside every Lua script a `redis.call` may only address keys
 *    that arrive through KEYS[] (Lua that builds key names from ARGV hits
 *    keys the client never routed — CROSSSLOT / wrong shard).
 * 2. Slot check: for each family of keys that one script receives together,
 *    thousands of sample ids always land on ONE shard of the 3.
 */

const SRC = join(__dirname, '..');

function shardOf(key: string): 0 | 1 | 2 {
  const slot = keySlot(key);
  return slot <= 5460 ? 0 : slot <= 10922 ? 1 : 2;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/** Lua literals: template strings or quoted strings that call redis.call. */
export function luaScripts(text: string): string[] {
  const out: string[] = [];
  for (const re of [
    /`([^`]*redis\.call\([^`]*)`/g,
    /"([^"\n]*redis\.call\([^"\n]*)"/g,
  ]) {
    for (const m of text.matchAll(re)) out.push(m[1]);
  }
  return out;
}

/** Commands whose first argument is not a key. */
const KEYLESS = new Set(['TIME', 'PUBLISH', 'SPUBLISH', 'SCRIPT']);

/** First-argument expressions of redis.call that are NOT a KEYS reference. */
export function foreignKeyArgs(script: string): string[] {
  // identifiers bound to a KEYS element: `local key = KEYS[i]`, loop `for _, k in ipairs(KEYS)`
  const bound = new Set<string>();
  for (const m of script.matchAll(/local\s+(\w+)\s*=\s*KEYS\[/g))
    bound.add(m[1]);
  for (const m of script.matchAll(
    /for\s+\w+\s*,\s*(\w+)\s+in\s+ipairs\(KEYS\)/g,
  ))
    bound.add(m[1]);
  const bad: string[] = [];
  for (const m of script.matchAll(
    /redis\.call\(\s*'(\w+)'\s*(?:,\s*([^,)]+))?/g,
  )) {
    const cmd = m[1].toUpperCase();
    if (KEYLESS.has(cmd)) continue;
    const arg = (m[2] ?? '').trim();
    if (/^KEYS\[[\w+*\- ]+\]$/.test(arg) || bound.has(arg)) continue;
    bad.push(`${cmd} ${arg}`);
  }
  return bad;
}

describe('Redis Lua scripts: only declared keys are touched', () => {
  const scripts: { file: string; script: string }[] = [];
  for (const abs of walk(SRC)) {
    for (const script of luaScripts(readFileSync(abs, 'utf8'))) {
      scripts.push({ file: relative(SRC, abs), script });
    }
  }

  it('finds the Lua scripts of the code base (the scan itself works)', () => {
    expect(scripts.length).toBeGreaterThanOrEqual(12);
  });

  it('every redis.call addresses a key passed in KEYS[]', () => {
    const offenders = scripts.flatMap((s) =>
      foreignKeyArgs(s.script).map((b) => `${s.file}: redis.call(${b})`),
    );
    expect(offenders).toEqual([]);
  });

  it('the detector flags a script that builds a key name in Lua', () => {
    expect(
      foreignKeyArgs(`redis.call('GET', 'user:' .. ARGV[1])`),
    ).toHaveLength(1);
    expect(foreignKeyArgs(`redis.call('GET', KEYS[1])`)).toHaveLength(0);
    expect(
      foreignKeyArgs(`for _, k in ipairs(KEYS) do redis.call('DEL', k) end`),
    ).toHaveLength(0);
  });
});

describe('key families of one script share a shard (3-shard topology)', () => {
  const OLD = process.env.REDIS_CLUSTER;
  beforeAll(() => {
    process.env.REDIS_CLUSTER = 'true';
  });
  afterAll(() => {
    if (OLD === undefined) delete process.env.REDIS_CLUSTER;
    else process.env.REDIS_CLUSTER = OLD;
  });

  const ids = Array.from({ length: 600 }, (_, i) => `id-${i * 7919}-${i}`);

  /** Asserts: per sample, all `keys(sample)` share a shard; and the samples
   * themselves are spread over all 3 shards (the test can fail). */
  function family(name: string, keys: (id: string) => string[]) {
    it(name, () => {
      const shards = new Set<number>();
      for (const id of ids) {
        const ks = keys(id);
        const s = new Set(ks.map(shardOf));
        expect([name, id, [...s]]).toEqual([name, id, [[...s][0]]]);
        shards.add(shardOf(ks[0]));
      }
      if (name.includes('spread')) expect(shards.size).toBe(3);
    });
  }

  family(
    'ck(tag, …) keys of one subject (throttler hits+block, OTP, admin session) spread over 3 shards',
    (id) => [
      ck(id, `hits:${id}`),
      ck(id, `block:${id}`),
      ck(id, `otp:code:${id}`),
      ck(id, `otp:att:${id}`),
      ck(id, `otp:strikes:${id}`),
      ck(id, `otp:lock:${id}`),
    ],
  );

  for (const entity of [
    'post',
    'comment',
    'case',
    'case_comment',
    'attorney',
    'client',
  ]) {
    it(`counters ${entity}: every hash shard and the touched set are one slot`, () => {
      const keys = [touchedKey(entity)];
      for (const f of ['like_count', 'comment_count', 'followers_count']) {
        for (let s = 0; s < COUNTER_SHARDS; s += 1)
          keys.push(pendingKey(entity, f, s));
      }
      expect(new Set(keys.map(keySlot)).size).toBe(1);
    });
  }

  it('cost guard: all money counters share one slot, a provider’s windows share one slot', () => {
    const at = new Date('2026-10-25T12:00:00Z');
    const money = ids.flatMap((id) => [
      moneyCounterKey('global', at, id),
      moneyCounterKey('provider', at, id),
      moneyCounterKey('user', at, id),
    ]);
    expect(new Set(money.map(keySlot)).size).toBe(1);
    const windows = COST_WINDOWS.map((w) => costCounterKey('sms', w, at));
    expect(new Set(windows.map(keySlot)).size).toBe(1);
  });

  it('case views: seen + pending share one slot', () => {
    for (const id of ids) {
      expect(keySlot(ck('cv', `cv:seen:${id}`))).toBe(
        keySlot(ck('cv', 'cv:pending')),
      );
    }
  });

  it('BullMQ: all keys of a queue share a slot, per-queue tags spread, {bull} collapses', () => {
    const queues = ['push', 'files', 'cron', 'billing', 'exports', 'media'];
    const env = { REDIS_CLUSTER: 'true' };
    const per = queues.map((q) => {
      const p = bullOptions(q, 'redis://h:1', {}, env).prefix as string;
      const ks = [
        'wait',
        'active',
        'prioritized',
        'id',
        'meta',
        'events',
        'stalled',
        'marker',
      ].map((k) => `${p}:${q}:${k}`);
      expect(new Set(ks.map(keySlot)).size).toBe(1);
      return ks[0];
    });
    expect(new Set(per.map(shardOf)).size).toBeGreaterThan(1);
    const one = queues.map((q) => {
      const p = bullOptions(
        q,
        'redis://h:1',
        {},
        { ...env, REDIS_BULL_PREFIX: '{bull}' },
      ).prefix as string;
      return `${p}:${q}:wait`;
    });
    expect(new Set(one.map(keySlot)).size).toBe(1);
  });
});
