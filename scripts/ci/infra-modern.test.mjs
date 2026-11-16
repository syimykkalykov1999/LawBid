// Owner 14.11 «newest methods for everything» (docs/dev/AUTO_MODERNIZE_2026-11-15.md):
//  - every Python Lambda runs the newest GA Python Lambda runtime, python3.14
//    (AWS Lambda runtimes page, checked 15.11.2026: python3.14 on AL2023,
//    deprecation 30.06.2029; python3.15 is public preview, not for prod),
//    accepted by the pinned AWS provider 6.72, on Graviton (arm64);
//  - Redis can move to Valkey (AWS: node-based 20 % cheaper, in-place, no
//    downtime) by one variable; the default keeps today's engine, so the
//    next apply does not change the cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const mod = (m) => new URL(`../../infra/modules/${m}/main.tf`, import.meta.url);
const modules = readdirSync(new URL('../../infra/modules/', import.meta.url)).filter((m) => existsSync(mod(m)));

test('every Python Lambda: python3.14 on arm64', () => {
  const found = [];
  for (const m of modules) {
    const tf = readFileSync(mod(m), 'utf8');
    for (const r of tf.matchAll(/runtime\s*=\s*"(python[0-9.]+)"[^\n]*\n\s*architectures\s*=\s*\[([^\]]*)\]/g)) {
      found.push(`${m}:${r[1]}:${r[2].trim()}`);
    }
  }
  assert.ok(found.length >= 7, found.join(' '));
  for (const f of found) assert.match(f, /:python3\.14:"arm64"$/, f);
});

test('Redis → Valkey is one variable, default unchanged', () => {
  const tf = readFileSync(mod('redis'), 'utf8');
  assert.match(tf, /variable "engine"[\s\S]*?default\s*=\s*"redis"/);
  assert.match(tf, /engine\s*=\s*var\.engine/);
  assert.match(tf, /var\.engine == "valkey" \? "valkey9" : "redis7"/);
});
