#!/usr/bin/env node
// Mobile dependency audit (2026-10-22): vulnerabilities that OSV-Scanner finds
// in apps/mobile/pubspec.lock BLOCK the merge, except those listed in
// .github/pub-audit-allowlist.json.
//
//   node scripts/ci/pub-audit-gate.mjs osv-results.json
//
// The JSON is the output of `osv-scanner --format json`. To allow a finding
// (only when it cannot be fixed now: no patched release yet, or it sits in a
// build-time tool), add an entry to .github/pub-audit-allowlist.json:
//   { "id": "GHSA-xxxx-xxxx-xxxx", "package": "<name>",
//     "reason": "why it does not reach the app / what blocks the fix",
//     "expires": "YYYY-MM-DD" }
// The id may be the OSV id or any alias (CVE-...). An expired entry fails
// the check again, so every exception is revisited.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2];
if (!file) {
  console.error('usage: pub-audit-gate.mjs <osv-results.json>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(file, 'utf8'));
const allow = JSON.parse(readFileSync(join(root, '.github', 'pub-audit-allowlist.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const entries = new Map();
let bad = 0;
for (const a of allow.advisories ?? []) {
  if (!a.id || !a.package || !a.reason || !/^\d{4}-\d{2}-\d{2}$/.test(a.expires ?? '')) {
    console.error(`allowlist entry is incomplete (needs id, package, reason, expires): ${JSON.stringify(a)}`);
    bad++;
    continue;
  }
  entries.set(a.id, a);
}

const found = [];
for (const res of report.results ?? []) {
  for (const p of res.packages ?? []) {
    for (const v of p.vulnerabilities ?? []) {
      found.push({
        pkg: `${p.package?.name}@${p.package?.version}`,
        id: v.id,
        ids: [v.id, ...(v.aliases ?? [])],
        summary: v.summary ?? '',
      });
    }
  }
}

for (const f of found) {
  const hit = f.ids.map((i) => entries.get(i)).find(Boolean);
  if (hit && hit.expires >= today) {
    console.log(`allowed  ${f.pkg}  ${f.id}  (until ${hit.expires}): ${hit.reason}`);
  } else if (hit) {
    console.error(`EXPIRED  ${f.pkg}  ${f.id}  allowlist entry ended ${hit.expires}`);
    bad++;
  } else {
    console.error(`BLOCKED  ${f.pkg}  ${f.id}  ${f.summary}`);
    bad++;
  }
}

console.log(`${found.length} finding(s), ${bad} blocking.`);
process.exit(bad ? 1 : 0);
