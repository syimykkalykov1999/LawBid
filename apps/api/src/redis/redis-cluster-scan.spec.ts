import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import allowlist from './redis-cluster-scan.allowlist.json';

/**
 * Redis Cluster guard (docs/architecture/REDIS_CLUSTER_READY.md).
 *
 * 1. Every Redis connection is created by src/redis/redis-connection.ts —
 *    no `new Redis(`, `new Cluster(` or a raw BullMQ `connection: { url }`
 *    anywhere else.
 * 2. Every call that can touch several keys (MGET, multi-key DEL, MULTI,
 *    Lua with KEYS[2+], set operations, SCAN, a raw pipeline) is listed in
 *    redis-cluster-scan.allowlist.json with the reason it is safe in a
 *    cluster (keys share a `{hash tag}` via ck(), a helper from
 *    redis-cluster-safe.ts is used, or the keys are one key). A new
 *    multi-key call fails this test until someone writes that reason down.
 * 3. A stale allowlist entry (nothing matches it any more) fails too.
 */

const SRC = join(__dirname, '..');
const CONNECTION_FILE = 'redis/redis-connection.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

export interface Finding {
  file: string;
  kind: string;
}

const RULES: { kind: string; re: RegExp }[] = [
  { kind: 'mget', re: /(?:redis|\br)\s*\.mget\(/ },
  // del/unlink/exists/touch with more than one key (comma or spread)
  {
    kind: 'del-multi',
    re: /(?:redis|\br)\s*\.(?:del|unlink|exists)\(\s*(?:\.\.\.|[^()]*,)/,
  },
  {
    kind: 'set-op',
    re: /(?:redis|\br)\s*\.(?:sunion|sinter|sdiff|sunionstore|sinterstore|sdiffstore|zunionstore|zinterstore|zunion|zinter|smove|rename|renamenx|lmove|rpoplpush|pfmerge|bitop|msetnx|mset)\(/,
  },
  { kind: 'multi', re: /\.multi\(\)/ },
  { kind: 'pipeline-raw', re: /\.pipeline\(\)/ },
  { kind: 'scan', re: /(?:redis|node)\.(?:scan|scanStream)\(/ },
  {
    kind: 'lua-multi-key',
    re: /KEYS\[[2-9]\]|ipairs\(KEYS\)|numberOfKeys:\s*[2-9]/,
  },
  {
    kind: 'eval-spread-keys',
    re: /\.eval(?:sha)?\(\s*\w+\s*,\s*(?:\w+\.length|n \* \d)/,
  },
];

export function scan(): { findings: Finding[]; violations: string[] } {
  const findings: Finding[] = [];
  const violations: string[] = [];
  for (const abs of walk(SRC)) {
    const file = relative(SRC, abs);
    const text = readFileSync(abs, 'utf8');
    if (file !== CONNECTION_FILE) {
      if (/new (?:Redis|IORedis|Cluster)\(/.test(text)) {
        violations.push(
          `${file}: creates a Redis client; use createRedisClient()`,
        );
      }
      if (/connection:\s*\{\s*url/.test(text)) {
        violations.push(`${file}: raw BullMQ connection; use bullOptions()`);
      }
    }
    if (file === 'redis/redis-cluster-safe.ts' || file === CONNECTION_FILE)
      continue;
    for (const rule of RULES) {
      if (rule.re.test(text)) findings.push({ file, kind: rule.kind });
    }
  }
  return { findings, violations };
}

describe('Redis Cluster guard', () => {
  const { findings, violations } = scan();
  const allowed = new Set(
    (allowlist as { file: string; kind: string; reason: string }[]).map(
      (a) => `${a.file}|${a.kind}`,
    ),
  );

  it('creates every client and every BullMQ connection in one place', () => {
    expect(violations).toEqual([]);
  });

  it('has a written cluster reason for every multi-key Redis call', () => {
    const missing = findings
      .map((f) => `${f.file}|${f.kind}`)
      .filter((k) => !allowed.has(k));
    expect(missing).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const present = new Set(findings.map((f) => `${f.file}|${f.kind}`));
    expect([...allowed].filter((k) => !present.has(k))).toEqual([]);
  });

  it('gives every allowlist entry a reason', () => {
    for (const a of allowlist as { reason: string }[]) {
      expect(a.reason.length).toBeGreaterThan(15);
    }
  });
});
