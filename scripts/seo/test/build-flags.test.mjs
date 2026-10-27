import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { mergeSite } from '../merge-site.mjs';
import { dayOf } from '../build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const run = (extra = [], env = {}, date = '2026-10-15') => {
  const out = mkdtempSync(join(tmpdir(), 'seo-flags-'));
  const stdout = execFileSync(
    'node',
    [join(here, '..', 'build.mjs'), '--offline', join(here, 'fixture.json'), '--site', 'https://example.test', '--out', out, '--date', date, ...extra],
    { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' },
  );
  return { out, stdout, read: (f) => readFileSync(join(out, f), 'utf8') };
};
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test('defaults: public output stays legacy (urlset, plain robots, no llms, no manifest) but without aggregateRating', () => {
  const b = run();
  assert.match(b.read('sitemap.xml'), /<urlset /);
  assert.equal(b.read('robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\n');
  for (const f of ['llms.txt', 'llms-full.txt', 'seo-manifest.json', 'sitemaps']) assert.equal(existsSync(join(b.out, f)), false, f);
  const html = b.read('attorneys/anna.lee/index.html');
  assert.doesNotMatch(html, /aggregateRating|AggregateRating/);
  assert.match(html, /"@type":"Attorney"/);
  assert.match(html, /Rating:<\/strong> 4.8 from 12 reviews/); // the visible text is unchanged
});

test('lastmod is the entity updatedAt when the data has it, else the build day; never in the future', () => {
  const b = run();
  const sm = b.read('sitemap.xml');
  assert.match(sm, /attorneys\/anna\.lee\/<\/loc><lastmod>2026-09-01<\/lastmod>/);
  assert.match(sm, /attorneys\/bob\.stone\/<\/loc><lastmod>2026-10-15<\/lastmod>/);
  assert.equal(dayOf('2030-01-01T00:00:00Z', '2026-10-15'), '2026-10-15');
  assert.equal(dayOf('nonsense', '2026-10-15'), null);
  assert.equal(dayOf(undefined, '2026-10-15'), null);
});

test('with the previous manifest an unchanged page keeps its lastmod, a changed one gets the new day', () => {
  const first = run(['--manifest'], {}, '2026-10-15');
  const prevFile = join(first.out, 'seo-manifest.json');
  const second = run(['--manifest', '--prev-manifest', prevFile], {}, '2026-10-20');
  const sm = second.read('sitemap.xml');
  assert.match(sm, /attorneys\/bob\.stone\/<\/loc><lastmod>2026-10-15<\/lastmod>/); // same content, same date
  const m1 = JSON.parse(first.read('seo-manifest.json'));
  const m2 = JSON.parse(second.read('seo-manifest.json'));
  assert.equal(m2.pages['/attorneys/bob.stone/'].hash, m1.pages['/attorneys/bob.stone/'].hash);
  // change the data: bob gets a bio
  const data = JSON.parse(readFileSync(join(here, 'fixture.json'), 'utf8'));
  data.attorneys[1].bio = 'Criminal defence and DUI in Texas.';
  const f = join(mkdtempSync(join(tmpdir(), 'seo-fx-')), 'fixture.json');
  writeFileSync(f, JSON.stringify(data));
  const out = mkdtempSync(join(tmpdir(), 'seo-flags-'));
  execFileSync('node', [join(here, '..', 'build.mjs'), '--offline', f, '--site', 'https://example.test', '--out', out, '--date', '2026-10-21', '--manifest', '--prev-manifest', prevFile]);
  assert.match(readFileSync(join(out, 'sitemap.xml'), 'utf8'), /attorneys\/bob\.stone\/<\/loc><lastmod>2026-10-21<\/lastmod>/);
});

test('sitemap index: per-type files under the limit, indexable pages only, one entry per page', () => {
  const b = run(['--sitemap-index', '--sitemap-max', '40']);
  const idx = b.read('sitemap.xml');
  assert.match(idx, /<sitemapindex /);
  const children = locs(idx).map((l) => l.replace('https://example.test/', ''));
  assert.ok(children.length > 2);
  const all = [];
  for (const c of children) {
    const urls = locs(b.read(c));
    assert.ok(urls.length <= 40, c);
    all.push(...urls);
  }
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.includes('https://example.test/attorneys/anna.lee/'));
  assert.ok(!all.some((u) => u.includes('/lawyers/vermont/divorce/')));
  assert.ok(children.some((c) => c.startsWith('sitemaps/attorneys-')));
});

test('AI robots policy and llms files only with their switches', () => {
  const b = run(['--robots-ai', '--llms']);
  assert.match(b.read('robots.txt'), /User-agent: GPTBot\n(User-agent: [^\n]+\n)*Disallow: \/\n/);
  assert.match(b.read('robots.txt'), /User-agent: OAI-SearchBot/);
  const llms = b.read('llms.txt');
  assert.match(llms, /practice-areas\/divorce\//);
  assert.doesNotMatch(llms, /Anna Lee|anna\.lee|Bob Stone/); // no attorney names
  assert.match(b.read('llms-full.txt'), /## Divorce/);
  const viaEnv = run([], { SEO_LLMS: '1', SEO_ROBOTS_AI: 'true', SEO_AI_TRAINING: 'allow' });
  assert.ok(existsSync(join(viaEnv.out, 'llms.txt')));
  assert.doesNotMatch(viaEnv.read('robots.txt'), /GPTBot/);
});

test('quality gate: a thin profile is noindex and out of the sitemap; off by default', () => {
  const on = run(['--quality-gate']);
  assert.match(on.read('attorneys/anna.lee/index.html'), /content="noindex,follow"/);
  assert.doesNotMatch(on.read('sitemap.xml'), /attorneys\/anna\.lee/);
  const off = run();
  assert.match(off.read('attorneys/anna.lee/index.html'), /content="index,follow"/);
});

test('ramp: a fresh start admits only N new pages a day; the next day admits N more', () => {
  const day1 = run(['--ramp-per-day', '25', '--ramp-baseline', 'none'], {}, '2026-10-15');
  const idx1 = locs(day1.read('sitemap.xml'));
  assert.equal(idx1.length, 25);
  assert.match(day1.stdout, /\d+ pages \(25 indexed/);
  const m1 = JSON.parse(day1.read('seo-manifest.json'));
  assert.equal(m1.ramp.perDay, 25);
  const day2 = run(['--ramp-per-day', '25', '--ramp-baseline', 'none', '--prev-manifest', join(day1.out, 'seo-manifest.json')], {}, '2026-10-16');
  const idx2 = locs(day2.read('sitemap.xml'));
  assert.equal(idx2.length, 50);
  for (const u of idx1) assert.ok(idx2.includes(u));
});

test('ramp: switching it on for a live site keeps every page indexed (baseline)', () => {
  const plain = locs(run().read('sitemap.xml')).length;
  const ramped = locs(run(['--ramp-per-day', '10']).read('sitemap.xml')).length;
  assert.equal(ramped, plain);
});

test('dry run decides everything and writes nothing', () => {
  const out = mkdtempSync(join(tmpdir(), 'seo-dry-'));
  const stdout = execFileSync('node', [join(here, '..', 'build.mjs'), '--offline', join(here, 'fixture.json'), '--site', 'https://example.test', '--out', join(out, 'dist'), '--dry-run', '--quality-gate', '--sitemap-index', '--llms'], { encoding: 'utf8' });
  assert.match(stdout, /dry run, nothing written/);
  assert.match(stdout, /"thin-profile"/);
  assert.deepEqual(readdirSync(out), []);
});

test('merge-site in index mode adds the company site as one more child sitemap and keeps the SEO robots.txt', async () => {
  const b = run(['--sitemap-index', '--robots-ai']);
  const site = mkdtempSync(join(tmpdir(), 'site-'));
  mkdirSync(join(site, 'about'));
  writeFileSync(join(site, 'about', 'index.html'), 'ABOUT');
  writeFileSync(join(site, 'sitemap.xml'), '<urlset><url><loc>https://example.test/about/</loc></url><url><loc>https://example.test/lawyers/x/</loc></url></urlset>');
  const r = await mergeSite({ seo: b.out, site, siteUrl: 'https://example.test' });
  const idx = b.read('sitemap.xml');
  assert.match(idx, /sitemaps\/site-1\.xml/);
  assert.deepEqual(locs(b.read('sitemaps/site-1.xml')), ['https://example.test/', 'https://example.test/about/']);
  assert.match(b.read('robots.txt'), /User-agent: GPTBot/);
  assert.ok(r.urls > 10);
  assert.ok(b.read('public-paths.txt').split('\n').includes('sitemaps'));
});

test('merge-site in plain mode keeps lastmod of the SEO pages', async () => {
  const b = run();
  const site = mkdtempSync(join(tmpdir(), 'site-'));
  writeFileSync(join(site, 'sitemap.xml'), '<urlset><url><loc>https://example.test/about/</loc></url></urlset>');
  await mergeSite({ seo: b.out, site, siteUrl: 'https://example.test' });
  assert.match(b.read('sitemap.xml'), /attorneys\/anna\.lee\/<\/loc><lastmod>2026-09-01<\/lastmod>/);
  assert.match(b.read('sitemap.xml'), /<loc>https:\/\/example.test\/about\/<\/loc>/);
});
