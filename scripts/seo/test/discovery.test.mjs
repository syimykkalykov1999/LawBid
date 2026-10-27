import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROBOTS_DISALLOW,
  SEARCH_BOTS,
  SITEMAP_HARD_LIMIT,
  TRAINING_BOTS,
  clampMax,
  llmsFullTxt,
  llmsTxt,
  robotsTxt,
  sitemapIndex,
  sitemapType,
} from '../lib/discovery.mjs';

const SITE = 'https://example.test';
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test('sitemap types follow the first folder', () => {
  assert.equal(sitemapType('/attorneys/a/'), 'attorneys');
  assert.equal(sitemapType('/practice-areas/divorce/'), 'practice-areas');
  assert.equal(sitemapType('/lawyers/texas/divorce/'), 'lawyers');
  assert.equal(sitemapType('/about/'), 'site');
});

test('the limit is never above 50 000 and falls back to 10 000 on junk', () => {
  assert.equal(clampMax('1000000'), SITEMAP_HARD_LIMIT);
  assert.equal(clampMax('abc'), 10000);
  assert.equal(clampMax('0'), 10000);
  assert.equal(clampMax('25'), 25);
});

test('sitemap index: per-type files, at most `max` urls each, real lastmod, valid shape', () => {
  const entries = [];
  for (let i = 0; i < 25; i++) entries.push({ path: `/attorneys/u${String(i).padStart(2, '0')}/`, lastmod: `2026-09-${String((i % 28) + 1).padStart(2, '0')}` });
  entries.push({ path: '/lawyers/', lastmod: '2026-10-01' }, { path: '/practice-areas/divorce/', lastmod: '2026-08-01' });
  const { index, files } = sitemapIndex({ site: SITE, entries, max: 10 });
  assert.deepEqual([...files.keys()], ['sitemaps/attorneys-1.xml', 'sitemaps/attorneys-2.xml', 'sitemaps/attorneys-3.xml', 'sitemaps/lawyers-1.xml', 'sitemaps/practice-areas-1.xml']);
  for (const xml of files.values()) {
    assert.ok(locs(xml).length <= 10);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
    assert.doesNotMatch(xml, /<priority>/);
  }
  assert.equal(locs([...files.values()].join('')).length, 27);
  assert.match(index, /<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.deepEqual(locs(index), [...files.keys()].map((k) => `${SITE}/${k}`));
  // an index entry's lastmod is the newest of its children
  assert.match(index, /sitemaps\/lawyers-1.xml<\/loc><lastmod>2026-10-01<\/lastmod>/);
  assert.match(files.get('sitemaps/attorneys-1.xml'), /<lastmod>2026-09-\d\d<\/lastmod>/);
});

test('no entry exceeds 50 000 per file even when asked for more', () => {
  const entries = Array.from({ length: 50001 }, (_, i) => ({ path: `/attorneys/u${i}/`, lastmod: '2026-10-01' }));
  const { files } = sitemapIndex({ site: SITE, entries, max: 999999 });
  assert.equal(files.size, 2);
  assert.equal(locs(files.get('sitemaps/attorneys-1.xml')).length, 50000);
});

test('an empty set still gives a valid sitemap, not an empty index', () => {
  const { index, files } = sitemapIndex({ site: SITE, entries: [] });
  assert.equal(files.size, 0);
  assert.match(index, /<urlset/);
});

test('urls are escaped in the sitemap', () => {
  const { files } = sitemapIndex({ site: SITE, entries: [{ path: '/attorneys/a&b/', lastmod: '2026-10-01' }] });
  assert.match([...files.values()][0], /a&amp;b/);
});

test('robots.txt without the switch is the legacy file', () => {
  assert.equal(robotsTxt({ site: SITE }), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
});

test('robots.txt AI policy: search bots in, training bots out, sitemap line, noindex paths not blocked', () => {
  const txt = robotsTxt({ site: SITE, ai: true });
  const group = (agent) => txt.split('\n\n').find((g) => g.split('\n').includes(`User-agent: ${agent}`)) ?? '';
  for (const b of SEARCH_BOTS) {
    assert.match(group(b), /Allow: \//, b);
    assert.match(group(b), /Disallow: \/api\//, b);
    assert.doesNotMatch(group(b), /Disallow: \/\n/, b);
  }
  for (const b of ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended']) {
    assert.ok(TRAINING_BOTS.includes(b));
    assert.match(group(b), /Disallow: \/(\n|$)/, b);
    assert.doesNotMatch(group(b), /Allow:/, b);
  }
  for (const d of ROBOTS_DISALLOW) assert.ok(txt.includes(`Disallow: ${d}`), d);
  assert.doesNotMatch(txt, /Disallow: \/lawyers/); // a robots block would hide a noindex mark
  assert.doesNotMatch(txt, /Disallow: \/\.well-known/);
  assert.match(txt, new RegExp(`Sitemap: ${SITE}/sitemap.xml\\n$`));
});

test('robots.txt can let the training bots in', () => {
  const txt = robotsTxt({ site: SITE, ai: true, allowTraining: true });
  assert.doesNotMatch(txt, /User-agent: GPTBot/);
});

test('llms.txt is short and factual: links and counts, no attorney names', () => {
  const practices = [{ slug: 'divorce', name: 'Divorce' }];
  const states = [{ slug: 'texas', name: 'Texas' }];
  const txt = llmsTxt({ site: SITE, practices, states, attorneyCount: 2 });
  assert.match(txt, /^# LawBid\n/);
  assert.match(txt, /not a law firm/);
  assert.match(txt, /\(https:\/\/example.test\/practice-areas\/divorce\/\)/);
  assert.match(txt, /\(https:\/\/example.test\/lawyers\/texas\/\)/);
  assert.match(txt, /2 verified attorney profiles/);
  assert.ok(txt.length < 2000);
});

test('llms-full.txt holds the practice guides only', () => {
  const txt = llmsFullTxt({ site: SITE, practices: [{ slug: 'divorce', name: 'Divorce', intro: 'How it\nworks.', situations: ['a'], faq: [['Q?', 'A.']] }] });
  assert.match(txt, /## Divorce\nURL: https:\/\/example.test\/practice-areas\/divorce\//);
  assert.match(txt, /How it works\./);
  assert.match(txt, /Q: Q\?\nA: A\./);
  assert.doesNotMatch(txt, /@|\+?\d{3}[ -]\d{3}/); // no e-mail or phone-like text
});
