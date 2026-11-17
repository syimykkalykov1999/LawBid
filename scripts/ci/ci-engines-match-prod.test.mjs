// 17.11 (docs/dev/CONTENT_MEDIA_VERIFY_2026-11-17.md №1): CI and the Mac must
// test on the SAME database and cache engines as prod. Prod runs RDS
// PostgreSQL `database_major_version` (infra/envs/prod/growth.auto.tfvars.json)
// and ElastiCache `redis_engine` (infra/envs/prod/variables.tf) at the version
// modules/redis picks. Before this guard CI ran postgres:16.15 + redis:7.4.12
// while prod was on 18.6 + Valkey 9.1, so an engine difference could reach
// prod with every check green.
//   node --test scripts/ci/ci-engines-match-prod.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const prodPgMajor = JSON.parse(read('infra/envs/prod/growth.auto.tfvars.json')).database_major_version;
const prodVars = read('infra/envs/prod/variables.tf');
const prodCacheEngine = /variable "redis_engine"[\s\S]*?default\s*=\s*"(\w+)"/.exec(prodVars)?.[1];
const redisTf = read('infra/modules/redis/main.tf');
const valkeyVersion = /var\.engine == "valkey" \? "([0-9.]+)"/.exec(redisTf)?.[1];

const workflows = readdirSync(new URL('.github/workflows/', root))
  .filter((f) => f.endsWith('.yml'))
  .map((f) => [`.github/workflows/${f}`, read(`.github/workflows/${f}`)]);
const composes = ['docker-compose.yml', 'loadtest/local-docker/compose.yml'].map((p) => [p, read(p)]);

// `image: <ref>` lines of the database and cache services.
function images(text, re) {
  return [...text.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]).filter((i) => re.test(i));
}
const PG = /^(docker\.io\/)?(library\/)?postgres:/;
const CACHE = /^(docker\.io\/)?((library\/)?redis|valkey\/valkey):/;

test('prod facts are readable', () => {
  assert.match(prodPgMajor, /^\d+$/);
  assert.equal(prodCacheEngine, 'valkey');
  assert.match(valkeyVersion ?? '', /^\d+\.\d+$/);
});

test('every CI and local Postgres is prod\'s major, one pinned minor everywhere', () => {
  const found = [];
  for (const [p, t] of [...workflows, ...composes]) for (const i of images(t, PG)) found.push([p, i]);
  assert.ok(found.length >= 8, `too few postgres images: ${found.length}`);
  const tags = new Set();
  for (const [p, i] of found) {
    const tag = i.split(':')[1].split('@')[0];
    assert.equal(tag.split('.')[0], prodPgMajor, `${p}: ${i} is not PostgreSQL ${prodPgMajor} (prod)`);
    assert.match(i, /@sha256:[0-9a-f]{64}$/, `${p}: ${i} is not pinned by digest`);
    tags.add(tag);
  }
  assert.equal(tags.size, 1, `different Postgres minors: ${[...tags].join(', ')}`);
});

test('every CI and local cache is prod\'s engine and version (Valkey)', () => {
  const found = [];
  for (const [p, t] of [...workflows, ...composes]) for (const i of images(t, CACHE)) found.push([p, i]);
  assert.ok(found.length >= 8, `too few cache images: ${found.length}`);
  for (const [p, i] of found) {
    assert.match(i, /^valkey\/valkey:/, `${p}: ${i} is not Valkey (prod engine ${prodCacheEngine})`);
    const tag = i.split(':')[1].split('@')[0];
    assert.ok(tag.startsWith(`${valkeyVersion}.`), `${p}: ${i} is not Valkey ${valkeyVersion} (prod)`);
    assert.match(i, /@sha256:[0-9a-f]{64}$/, `${p}: ${i} is not pinned by digest`);
  }
});

test('health checks use the Valkey client (the image has valkey-cli)', () => {
  for (const [p, t] of [...workflows, ...composes]) {
    assert.ok(!t.includes('redis-cli'), `${p} still calls redis-cli`);
  }
});
