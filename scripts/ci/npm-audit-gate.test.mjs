import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const gate = new URL('./npm-audit-gate.mjs', import.meta.url).pathname;
const run = (report, ...extra) => {
  const f = join(mkdtempSync(join(tmpdir(), 'audit-')), 'a.json');
  writeFileSync(f, JSON.stringify(report));
  return spawnSync('node', [gate, ...extra, f], { encoding: 'utf8' });
};
const vuln = (id) => ({
  vulnerabilities: {
    pkg: { via: [{ severity: 'high', url: `https://github.com/advisories/${id}`, title: 't', name: 'pkg' }] },
  },
});

test('an audit that did not run (registry error JSON) fails, not passes', () => {
  const r = run({ error: { code: 'ENOTFOUND', summary: 'offline' } });
  assert.equal(r.status, 1);
});
test('a clean report passes', () => {
  assert.equal(run({ vulnerabilities: {} }).status, 0);
});
test('an unallowed high advisory fails', () => {
  assert.equal(run(vuln('GHSA-aaaa-bbbb-cccc')).status, 1);
});
test('the allowlisted advisory passes', () => {
  // Own allowlist fixture (the repo list can be empty: deepmerge-ts, its last
  // entry, was fixed by Prisma 7). The gate reads <its root>/.github/…, so a
  // copy of the gate runs from a temporary root that has the fixture.
  const root = mkdtempSync(join(tmpdir(), 'audit-root-'));
  mkdirSync(join(root, 'scripts', 'ci'), { recursive: true });
  mkdirSync(join(root, '.github'));
  const copy = join(root, 'scripts', 'ci', 'npm-audit-gate.mjs');
  copyFileSync(gate, copy);
  writeFileSync(
    join(root, '.github', 'npm-audit-allowlist.json'),
    JSON.stringify({ advisories: [{ id: 'GHSA-test-allo-wed1', package: 'pkg', reason: 'test', expires: '2999-12-31' }] }),
  );
  const f = join(root, 'a.json');
  writeFileSync(f, JSON.stringify(vuln('GHSA-test-allo-wed1')));
  assert.equal(spawnSync('node', [copy, f], { encoding: 'utf8' }).status, 0);
});
test('a workspace run does not call another workspace allowlist entry stale', () => {
  const r = run({ vulnerabilities: {} }, '--workspace', 'apps/admin');
  assert.doesNotMatch(r.stdout, /no longer reported/);
});
