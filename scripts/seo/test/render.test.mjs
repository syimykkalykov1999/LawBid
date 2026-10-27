import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { defaultGate, renderSite } from '../lib/render.mjs';
import { planPublish, sha256 } from '../lib/manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const attorneys = JSON.parse(readFileSync(join(here, 'fixture.json'), 'utf8')).attorneys;
const base = { site: 'https://example.test', buildDate: '2026-10-27' };

test('renderSite is pure: the same input gives byte-identical pages, no file is written', () => {
  const a = renderSite(attorneys, base);
  const b = renderSite(attorneys, base);
  assert.deepEqual([...a.files.keys()], [...b.files.keys()]);
  for (const [path, html] of a.files) assert.equal(b.files.get(path), html);
  assert.ok(a.files.has('/lawyers/california/divorce/'));
  assert.ok(a.files.has('/attorneys/anna.lee/'));
  assert.equal(a.result.pages, a.files.size);
});

test('the options carry the switches: off by default, the gate and the ramp only when asked', () => {
  const plain = renderSite(attorneys, base);
  assert.equal(plain.discovery.has('llms.txt'), false);
  assert.equal(plain.discovery.has('seo-manifest.json'), false);
  const gated = renderSite(attorneys, { ...base, gate: { ...defaultGate, enabled: true }, llms: true, sitemapIndex: true, robotsAi: true });
  assert.ok(gated.discovery.has('llms.txt'));
  assert.ok([...gated.discovery.keys()].some((k) => k.startsWith('sitemaps/')));
  const ramped = renderSite(attorneys, { ...base, rampPerDay: 3 });
  assert.ok(ramped.discovery.has('seo-manifest.json'), 'a ramp needs its state file');
});

test('lastmod is the attorney updatedAt day (the directory API field), not the build day', () => {
  const r = renderSite(attorneys, { ...base, buildDate: '2026-10-27' });
  const sitemap = r.discovery.get('sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/example\.test\/attorneys\/anna\.lee\/<\/loc>\s*<lastmod>2026-09-01<\/lastmod>/);
});

test('planPublish from in-memory hashes: first run uploads all and resets nothing; later runs only the delta', () => {
  const pages = renderSite(attorneys, base).files;
  const hashes = Object.fromEntries([...pages].map(([p, html]) => [`${p.replace(/^\//, '')}index.html`, sha256(html)]));
  const first = planPublish({ files: hashes, prev: null, today: '2026-10-27' });
  assert.equal(first.upload.length, Object.keys(hashes).length);
  assert.deepEqual(first.invalidate, []);
  assert.equal(first.massDelete, false);

  const changed = { ...hashes, 'attorneys/anna.lee/index.html': sha256('new') };
  delete changed['lawyers/index.html'];
  const second = planPublish({ files: changed, prev: first.manifest, today: '2026-10-27' });
  assert.deepEqual(second.upload, ['attorneys/anna.lee/index.html']);
  assert.deepEqual(second.remove, ['lawyers/index.html']);
  assert.ok(second.invalidate.includes('/attorneys/anna.lee/'));
  assert.ok(second.invalidate.length <= 30);
  assert.equal(second.manifest.files['attorneys/anna.lee/index.html'], sha256('new'));
});

test('planPublish refuses a mass delete (an empty answer must not wipe the pages)', () => {
  const files = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`attorneys/x${i}/index.html`, `h${i}`]));
  const r = planPublish({ files: {}, prev: { files }, today: '2026-10-27' });
  assert.equal(r.massDelete, true);
});
