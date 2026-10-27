import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { deleteBatches, hashDir, isSafeInvalidationPath, pickInvalidations, planFiles, urlsForFile } from '../lib/manifest.mjs';
import { makePlan } from '../publish-plan.mjs';

const put = (root, rel, body) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
};

test('planFiles: new and changed files upload, unchanged are skipped, gone files are removed', () => {
  const p = planFiles({
    files: { 'a/index.html': '1', 'b/index.html': '2x', 'c/index.html': '3', '_next/new.js': '9' },
    prevFiles: { 'a/index.html': '1', 'b/index.html': '2', 'gone/index.html': '4', '_next/old.js': '8' },
  });
  assert.deepEqual(p.upload, ['_next/new.js', 'b/index.html', 'c/index.html']);
  assert.deepEqual(p.changed, ['b/index.html']);
  assert.deepEqual(p.remove, ['gone/index.html']); // _next files are never removed
  assert.equal(p.unchanged, 1);
});

test('viewer urls: a page has both forms, the hashed _next files none, the app root none', () => {
  assert.deepEqual(urlsForFile('lawyers/ca/index.html'), ['/lawyers/ca/', '/lawyers/ca/index.html']);
  assert.deepEqual(urlsForFile('sitemap.xml'), ['/sitemap.xml']);
  assert.deepEqual(urlsForFile('_next/static/a.js'), []);
  assert.deepEqual(urlsForFile('index.html'), []);
});

test('invalidation paths are never the whole distribution or the app', () => {
  for (const bad of ['/*', '/', '/index.html', '/v/abc/*', '/releases/x', '/icons/*', '/_next/*', '/lawyers*']) assert.equal(isSafeInvalidationPath(bad), false, bad);
  for (const ok of ['/lawyers/*', '/attorneys/a/', '/sitemap.xml', '/.well-known/assetlinks.json']) assert.equal(isSafeInvalidationPath(ok), true, ok);
});

test('invalidations: within budget every changed path, removals first', () => {
  const r = pickInvalidations({ changed: ['attorneys/a/index.html', 'sitemap.xml'], removed: ['attorneys/gone/index.html'], max: 30 });
  assert.deepEqual(r.paths, ['/attorneys/gone/', '/attorneys/gone/index.html', '/sitemap.xml', '/attorneys/a/', '/attorneys/a/index.html']);
  assert.equal(r.skipped, 0);
  assert.equal(r.used, 5);
});

test('invalidations: over 30 a day collapse into folder wildcards and never exceed the cap or reach /*', () => {
  const changed = [];
  for (let i = 0; i < 400; i++) changed.push(`attorneys/u${i}/index.html`);
  for (let i = 0; i < 400; i++) changed.push(`lawyers/s${i}/index.html`);
  changed.push('sitemap.xml', 'robots.txt');
  const r = pickInvalidations({ changed, removed: [], max: 30 });
  assert.ok(r.paths.length <= 30);
  assert.ok(r.paths.includes('/attorneys/*') && r.paths.includes('/lawyers/*'));
  assert.ok(r.paths.includes('/robots.txt') && r.paths.includes('/sitemap.xml'));
  assert.ok(r.paths.every(isSafeInvalidationPath));
  assert.equal(r.skipped, 0);
});

test('invalidations: the day budget is shared and a spent budget resets nothing', () => {
  const changed = Array.from({ length: 10 }, (_, i) => `x${i}.txt`);
  const r = pickInvalidations({ changed, removed: [], max: 30, usedToday: 25 });
  assert.equal(r.paths.length, 5);
  assert.equal(r.skipped, 5);
  assert.equal(r.used, 30);
  assert.equal(pickInvalidations({ changed, removed: [], max: 30, usedToday: 30 }).paths.length, 0);
});

test('deleteBatches follow the 1000-key limit of delete-objects', () => {
  const b = deleteBatches(Array.from({ length: 2500 }, (_, i) => `k${i}`));
  assert.deepEqual(b.map((x) => x.Objects.length), [1000, 1000, 500]);
  assert.equal(b[0].Quiet, true);
});

test('plan from a directory: first run uploads everything and resets nothing; the second only the change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-plan-'));
  put(dir, 'lawyers/index.html', 'one');
  put(dir, 'attorneys/a/index.html', 'two');
  put(dir, 'sitemap.xml', 'sm');
  const first = await makePlan({ dir, prev: null, today: '2026-10-27' });
  assert.equal(first.upload.length, 3);
  assert.deepEqual(first.invalidate, []);
  assert.equal(first.manifest.invalidations.used, 0);

  put(dir, 'attorneys/a/index.html', 'two changed');
  put(dir, 'attorneys/b/index.html', 'new');
  const second = await makePlan({ dir, prev: first.manifest, today: '2026-10-27' });
  assert.deepEqual(second.upload, ['attorneys/a/index.html', 'attorneys/b/index.html']);
  assert.deepEqual(second.invalidate, ['/attorneys/a/', '/attorneys/a/index.html']); // the new page needs none
  assert.equal(second.unchanged, 2);
  assert.equal(second.manifest.invalidations.used, 2);

  const third = await makePlan({ dir, prev: second.manifest, today: '2026-10-27' });
  assert.deepEqual(third.upload, []);
  assert.deepEqual(third.invalidate, []);

  const files = await hashDir(dir);
  assert.ok(!('seo-manifest.json' in files));
  assert.equal(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), 'sm');
});

test('a plan that removes most of the published files is flagged (an empty API answer must not wipe the site)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-wipe-'));
  put(dir, 'sitemap.xml', 'sm');
  const prevFiles = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`attorneys/u${i}/index.html`, 'h']));
  const r = await makePlan({ dir, prev: { files: prevFiles }, today: '2026-10-27' });
  assert.equal(r.massDelete, true);
  const small = await makePlan({ dir, prev: { files: { 'attorneys/a/index.html': 'h' } }, today: '2026-10-27' });
  assert.equal(small.massDelete, false);
});
