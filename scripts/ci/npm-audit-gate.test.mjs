import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
  assert.equal(run(vuln('GHSA-ggr8-5vv4-36mx')).status, 0);
});
test('a workspace run does not call another workspace allowlist entry stale', () => {
  const r = run({ vulnerabilities: {} }, '--workspace', 'apps/admin');
  assert.doesNotMatch(r.stdout, /no longer reported/);
});
