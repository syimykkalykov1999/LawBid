import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { diffManifests, hashDir, invalidationPaths } from '../publish-diff.mjs';
import { fetchAllAttorneys } from '../build.mjs';

test('only new and changed files are uploaded, vanished ones are deleted', () => {
  const prev = { 'a/index.html': '1', 'b/index.html': '2', 'gone/index.html': '3' };
  const next = { 'a/index.html': '1', 'b/index.html': 'X', 'new/index.html': '4' };
  assert.deepEqual(diffManifests(prev, next), {
    changed: ['b/index.html', 'new/index.html'],
    deleted: ['gone/index.html'],
  });
  assert.deepEqual(diffManifests(prev, next, true).changed, ['a/index.html', 'b/index.html', 'new/index.html']);
});

test('an unchanged build uploads and invalidates nothing', () => {
  const m = { 'sitemap.xml': 'h', 'attorneys/x/index.html': 'y' };
  const d = diffManifests(m, m);
  assert.deepEqual(d, { changed: [], deleted: [] });
  assert.deepEqual(invalidationPaths(d.changed, d.deleted), []);
});

test('invalidation: changed page addresses only, no hashed assets', () => {
  assert.deepEqual(
    invalidationPaths(['attorneys/anna/index.html', 'sitemap.xml', '_next/static/x.js'], ['lawyers/old/index.html']),
    ['/attorneys/anna/', '/lawyers/old/', '/sitemap.xml'],
  );
});

test('many changes collapse to folder wildcards, never to /*', () => {
  const changed = Array.from({ length: 300 }, (_, i) => `attorneys/a${i}/index.html`);
  const paths = invalidationPaths([...changed, 'sitemap.xml', 'robots.txt'], [], 50);
  assert.deepEqual(paths, ['/attorneys/*', '/robots.txt', '/sitemap.xml']);
  assert.ok(!paths.includes('/*'));
});

test('hashDir hashes nested files and skips the manifest itself', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  mkdirSync(join(dir, 'a', 'b'), { recursive: true });
  writeFileSync(join(dir, 'a', 'b', 'index.html'), 'x');
  writeFileSync(join(dir, 'seo-manifest.json'), '{}');
  const h = await hashDir(dir);
  assert.deepEqual(Object.keys(h), ['a/b/index.html']);
});

test('the directory crawl fails loudly instead of truncating at the page cap', async () => {
  const pages = [
    { data: [1, 2], meta: { nextCursor: 'c1' } },
    { data: [3], meta: { nextCursor: 'c2' } },
    { data: [4], meta: {} },
  ];
  let i = 0;
  const fetchFn = async () => ({ ok: true, json: async () => pages[i++] });
  await assert.rejects(fetchAllAttorneys({ api: 'x', fetchFn, maxPages: 2 }), /raise SEO_MAX_PAGES/);
  i = 0;
  assert.deepEqual(await fetchAllAttorneys({ api: 'x', fetchFn, maxPages: 3 }), [1, 2, 3, 4]);
});
