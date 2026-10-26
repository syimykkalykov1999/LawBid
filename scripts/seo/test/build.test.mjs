import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'seo-'));
execFileSync('node', [join(here, '..', 'build.mjs'), '--offline', join(here, 'fixture.json'), '--site', 'https://example.test', '--out', out, '--date', '2026-10-15'], { stdio: 'pipe' });
const page = (p) => readFileSync(join(out, p, 'index.html'), 'utf8');

test('a state x practice page lists its verified attorney and is indexed', () => {
  const html = page('/lawyers/california/divorce');
  assert.match(html, /Anna Lee/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/lawyers\/california\/divorce\/">/);
});

test('attorney text is escaped (no markup from a bio reaches the page)', () => {
  const html = page('/attorneys/anna.lee');
  assert.doesNotMatch(html, /<b>12<\/b>/);
  assert.match(html, /&lt;b&gt;12&lt;\/b&gt;/);
  assert.match(html, /"@type":"Attorney"/);
});

test('an empty combination is honest, invents nobody and is noindex outside the high-demand states', () => {
  const html = page('/lawyers/vermont/divorce');
  assert.match(html, /No divorce attorney licensed in Vermont is listed here yet/);
  assert.doesNotMatch(html, /class="card"/);
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
});

test('a high-demand state is indexed even before it has attorneys', () => {
  assert.match(page('/lawyers/florida/bankruptcy'), /content="index,follow"/);
});

test('the sitemap lists indexed pages only and robots.txt points to it', () => {
  const sitemap = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/example\.test\/lawyers\/california\/divorce\//);
  assert.doesNotMatch(sitemap, /lawyers\/vermont\/divorce\//);
  assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
  assert.ok(existsSync(join(out, 'practice-areas/family-law/index.html')));
});

test('no page mentions cases or clients data', () => {
  const html = page('/lawyers/california/family-law');
  assert.doesNotMatch(html, /client name|case title/i);
});

// Owner 2026-10-22 (audit #4 §9, ogp.me): absolute og:image everywhere.
test('every page has an absolute og:image; an attorney page uses the CDN photo', () => {
  assert.match(page('/lawyers'), /<meta property="og:image" content="https:\/\/example.test\/icons\/Icon-512.png">/);
  const html = page('/attorneys/anna.lee');
  assert.match(html, /<meta property="og:image" content="https:\/\/cdn.example.test\/avatars\/anna.jpg">/);
  assert.match(html, /summary_large_image/);
});

test('an attorney page lives at the lower-case /attorneys/<username>/ the API shares', () => {
  assert.ok(existsSync(join(out, 'attorneys', 'mixed.case', 'index.html')));
});
