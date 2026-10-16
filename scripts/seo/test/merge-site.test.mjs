import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { mergeSite } from '../merge-site.mjs';

function put(root, path, body) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

const seo = mkdtempSync(join(tmpdir(), 'seo-merge-'));
const site = mkdtempSync(join(tmpdir(), 'site-'));
put(seo, 'practice-areas/divorce/index.html', 'SEO divorce');
put(seo, 'lawyers/index.html', 'SEO lawyers');
put(seo, 'sitemap.xml', '<urlset><url><loc>https://lawbid.dev/lawyers/</loc></url></urlset>');
put(site, 'index.html', 'SITE HOME');
put(site, '404.html', 'SITE 404');
put(site, 'about/index.html', 'SITE ABOUT');
put(site, 'privacy/index.html', 'SITE PRIVACY');
put(site, 'practice-areas/divorce/index.html', 'SITE divorce');
put(site, 'practice-areas/index.html', 'SITE practice areas');
put(site, 'lawyers/texas/index.html', 'SITE lawyers');
put(site, '_next/static/a.js', 'js');
put(
  site,
  'sitemap.xml',
  '<urlset><url><loc>https://lawbid.dev</loc></url><url><loc>https://lawbid.dev/about/</loc></url><url><loc>https://lawbid.dev/lawyers/texas/</loc></url><url><loc>https://lawbid.dev/privacy/</loc></url></urlset>',
);
const r = await mergeSite({ seo, site, siteUrl: 'https://lawbid.dev' });
const read = (p) => readFileSync(join(seo, p), 'utf8');

test('the SEO pages win a clash; the site fills the rest', () => {
  assert.equal(read('practice-areas/divorce/index.html'), 'SEO divorce');
  assert.equal(read('practice-areas/index.html'), 'SITE practice areas');
  assert.equal(read('about/index.html'), 'SITE ABOUT');
  assert.equal(read('_next/static/a.js'), 'js');
});

test("the site's home, 404 and own /lawyers pages stay out (the root is the app)", () => {
  assert.equal(existsSync(join(seo, 'index.html')), false);
  assert.equal(existsSync(join(seo, '404.html')), false);
  assert.equal(existsSync(join(seo, 'lawyers/texas/index.html')), false);
});

test('one sitemap with both sets of addresses, no site home, no site /lawyers', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /<loc>https:\/\/lawbid.dev\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/lawbid.dev\/lawyers\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/lawbid.dev\/about\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/lawbid.dev\/privacy\/<\/loc>/);
  assert.doesNotMatch(xml, /lawyers\/texas/);
  assert.equal(r.urls, 4);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/lawbid.dev\/sitemap.xml/);
});

test('public-paths.txt lists what the app upload must keep', () => {
  const list = read('public-paths.txt').trim().split('\n');
  for (const p of ['_next', 'about', 'lawyers', 'practice-areas', 'privacy', 'sitemap.xml', 'robots.txt']) {
    assert.ok(list.includes(p), p);
  }
  assert.ok(!list.includes('index.html'));
});
