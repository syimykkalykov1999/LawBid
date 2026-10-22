#!/usr/bin/env node
// Audit #15 (2026-10-22): `npm audit` at high severity BLOCKS the merge,
// except for advisories listed in .github/npm-audit-allowlist.json.
//
//   node scripts/ci/npm-audit-gate.mjs [--workspace apps/api] [audit.json]
//
// Without a file argument it runs `npm audit --json` itself.
//
// To allow an advisory (only when it cannot be fixed now, e.g. it sits in
// a build-time tool or the fix is a major upgrade), add an entry to
// .github/npm-audit-allowlist.json:
//   { "id": "GHSA-xxxx-xxxx-xxxx", "package": "<name>",
//     "reason": "why it does not reach production / what blocks the fix",
//     "expires": "YYYY-MM-DD" }
// An expired entry fails the check again, so every exception is revisited.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const wsIdx = args.indexOf('--workspace');
const workspace = wsIdx >= 0 ? args[wsIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && (wsIdx < 0 || i !== wsIdx + 1));

function runAudit() {
  const cmd = ['audit', '--json', ...(workspace ? ['--workspace', workspace] : [])];
  try {
    return execFileSync('npm', cmd, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  } catch (e) {
    // npm audit exits 1 when it finds anything; the JSON is still on stdout.
    if (e.stdout) return e.stdout;
    throw e;
  }
}

const report = JSON.parse(file ? readFileSync(file, 'utf8') : runAudit());
const allow = JSON.parse(readFileSync(join(root, '.github', 'npm-audit-allowlist.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

/** GHSA id → { severity, packages, title } for every high/critical advisory. */
const found = new Map();
for (const [pkg, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = String(via.url ?? via.source).split('/').pop();
    const cur = found.get(id) ?? { severity: via.severity, title: via.title, packages: new Set() };
    cur.packages.add(via.name ?? pkg);
    found.set(id, cur);
  }
}

let failed = false;
for (const [id, a] of found) {
  const entry = allow.advisories.find((e) => e.id === id);
  const where = [...a.packages].join(', ');
  if (!entry) {
    console.error(`::error::${a.severity} ${id} in ${where}: ${a.title} — fix it, or allowlist it in .github/npm-audit-allowlist.json (see scripts/ci/npm-audit-gate.mjs)`);
    failed = true;
  } else if (entry.expires < today) {
    console.error(`::error::allowlist entry for ${id} (${where}) expired on ${entry.expires} — fix it or renew the entry with a reason`);
    failed = true;
  } else {
    console.log(`allowed until ${entry.expires}: ${a.severity} ${id} in ${where} — ${entry.reason}`);
  }
}
for (const e of allow.advisories) {
  if (!found.has(e.id)) console.log(`note: ${e.id} (${e.package}) is no longer reported — remove it from the allowlist`);
}
if (failed) process.exit(1);
console.log(`npm audit gate: ${found.size} high/critical advisor${found.size === 1 ? 'y' : 'ies'}, none unallowed`);
