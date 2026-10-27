#!/usr/bin/env node
// One GET per API module against a running API (scripts/dev/smoke-local.sh).
// The list is DERIVED from packages/api-contract/openapi.json (one GET
// without path parameters per tag), so a new module is covered without
// editing a hand-kept list (conflict-proof, docs/dev/SHARED_REGISTRIES.md).
//
// Pass = no 5xx and no network error. 401/403 (needs a login) and 404
// (a module behind a switch that is OFF) are expected and fine: they prove
// the route, the guards and the flag gate answer instead of crashing.
//
//   node scripts/dev/smoke-local-endpoints.mjs http://localhost:3999
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.argv[2] || 'http://localhost:3999').replace(/\/$/, '');
const spec = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'packages/api-contract/openapi.json'), 'utf8'),
);
const prefix = (spec.servers?.[0]?.url || '').replace(/\/$/, '');

const byTag = new Map();
for (const [path, ops] of Object.entries(spec.paths)) {
  const get = ops.get;
  if (!get || path.includes('{')) continue;
  const tag = get.tags?.[0] || path.split('/')[1] || 'root';
  if (!byTag.has(tag)) byTag.set(tag, path);
}

async function hit(path) {
  // Health lives outside the /api/v1 prefix in some builds: try both.
  const urls = path.startsWith('/health')
    ? [`${base}${path}`, `${base}${prefix}${path}`]
    : [`${base}${prefix}${path}`];
  let last;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      last = res.status;
      if (res.status !== 404 || !path.startsWith('/health')) return { url, status: res.status };
    } catch (e) {
      last = `network: ${e?.cause?.code || e?.name || e}`;
    }
  }
  return { url: urls.at(-1), status: last };
}

const rows = [];
for (const path of ['/health/live', '/health/ready', '/config/bootstrap']) {
  const r = await hit(path);
  rows.push({ tag: 'core', path, ...r, ok: r.status === 200 });
}
for (const [tag, path] of [...byTag.entries()].sort()) {
  const r = await hit(path);
  rows.push({ tag, path, ...r, ok: typeof r.status === 'number' && r.status < 500 });
}

const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${String(r.status).padEnd(4)} ${r.tag.padEnd(28)} ${r.path}`);
console.log(`\n${rows.length} requests, ${rows.length - bad.length} ok, ${bad.length} failed (5xx / no answer / core not 200)`);
process.exit(bad.length ? 1 : 0);
