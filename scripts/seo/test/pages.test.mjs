import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { defaultGate, renderSite } from '../lib/render.mjs';
import { hasContactInfo, mainText } from '../lib/gate.mjs';
import { answer, attorney, LONG, post, question, roster } from './pages-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://example.test';
const base = { site: SITE, buildDate: '2026-10-27' };
const ON = { pagesPosts: true, pagesCities: true, pagesQa: true };

const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const ldType = (html, type) => ldOf(html).find((o) => o['@type'] === type);
const robots = (html) => /<meta name="robots" content="([^"]+)">/.exec(html)[1];
const canonical = (html) => /<link rel="canonical" href="([^"]+)">/.exec(html)[1];
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const PW = '/attorneys/ann.nyc/posts/what-happens-after-a-divorce-summons-in-new-york-p0000001/';

// ---- all OFF ----
test('all three switches OFF: rows for the new types are ignored, output is byte-identical to a build without them', () => {
  const rows = { posts: [post('p0000001-aaaa', 'ann.nyc')], questions: [question('q0000001-aaaa', [answer('a1', 'ann.nyc')])] };
  const withRows = renderSite(roster(), { ...base, ...rows, sitemapIndex: true, llms: true });
  const without = renderSite(roster(), { ...base, sitemapIndex: true, llms: true });
  assert.deepEqual([...withRows.files.keys()], [...without.files.keys()]);
  for (const [path, html] of without.files) assert.equal(withRows.files.get(path), html, path);
  for (const [name, text] of without.discovery) assert.equal(withRows.discovery.get(name), text, name);
  const all = [...withRows.files.keys()];
  assert.equal(all.some((p) => p.includes('/posts/') || p.startsWith('/legal-questions')), false);
  assert.equal(all.some((p) => p.startsWith('/lawyers/new-york/brooklyn')), false, 'no city hub without SEO_PAGES_CITIES');
  assert.equal(withRows.result.postPages + withRows.result.cityPages + withRows.result.questionPages, 0);
});

// ---- posts ----
test('post page: Article JSON-LD, canonical, og:type article, breadcrumbs, no contact data', () => {
  const r = renderSite(roster(), { ...base, pagesPosts: true, posts: [post('p0000001-aaaa', 'ann.nyc')] });
  const html = r.files.get(PW);
  assert.ok(html, [...r.files.keys()].filter((k) => k.includes('posts')).join());
  assert.equal(canonical(html), `${SITE}${PW}`);
  assert.equal(robots(html), 'index,follow');
  assert.match(html, /<meta property="og:type" content="article">/);
  const a = ldType(html, 'Article');
  assert.equal(a['@context'], 'https://schema.org');
  assert.equal(a.headline, 'What happens after a divorce summons in New York');
  assert.equal(a.datePublished, '2026-10-10T09:00:00.000Z');
  assert.equal(a.dateModified, '2026-10-11T09:00:00.000Z');
  assert.equal(a.author['@type'], 'Person');
  assert.equal(a.author.name, 'Ann Nyc');
  assert.equal(a.author.url, `${SITE}/attorneys/ann.nyc/`);
  assert.equal(a.publisher.name, 'LawBid');
  assert.equal(a.mainEntityOfPage['@id'], `${SITE}${PW}`);
  const crumbs = ldType(html, 'BreadcrumbList').itemListElement.map((c) => c.name);
  assert.deepEqual(crumbs, ['Lawyers', 'Ann Nyc', 'What happens after a divorce summons in New York']);
  assert.match(html, /not legal advice/i);
  assert.equal(hasContactInfo(mainText(html)), false, 'no e-mail, phone or SSN on the page');
  assert.ok(html.length < 30 * 1024, 'plan §2.3: HTML <= 30 KB');
  assert.doesNotMatch(html, /<script(?![^>]*ld\+json)/, 'no blocking scripts');
});

test('post page: "Attorney Advertising" only for a NY attorney, and SEO_AD_LABEL=off removes it', () => {
  const two = [attorney('ann.nyc', { states: ['NY'] }), attorney('tom.tx', { states: ['TX'] })];
  const posts = [post('p0000001-aaaa', 'ann.nyc'), post('p0000002-bbbb', 'tom.tx')];
  const r = renderSite(two, { ...base, pagesPosts: true, posts });
  const ny = [...r.files].find(([p]) => p.startsWith('/attorneys/ann.nyc/posts/'))[1];
  const tx = [...r.files].find(([p]) => p.startsWith('/attorneys/tom.tx/posts/'))[1];
  assert.match(ny, /Attorney Advertising\./);
  assert.match(ny, /Prior results do not guarantee/);
  assert.doesNotMatch(tx, /Attorney Advertising/);
  const off = renderSite(two, { ...base, pagesPosts: true, posts, adLabel: 'off' });
  assert.doesNotMatch([...off.files].find(([p]) => p.startsWith('/attorneys/ann.nyc/posts/'))[1], /Attorney Advertising/);
});

test('posts: only text posts of listed attorneys without contact data become pages', () => {
  const posts = [
    post('p0000001-aaaa', 'ann.nyc'),
    post('p0000002-bbbb', 'nobody'), // author not in the directory
    post('p0000003-cccc', 'ann.nyc', { hasMedia: true }),
    post('p0000004-dddd', 'ann.nyc', { videoId: 'v1' }),
    post('p0000005-eeee', 'ann.nyc', { body: `${LONG} Call me at 212-555-0199.` }),
    post('p0000006-ffff', 'ann.nyc', { body: `${LONG} Write to me@example.com` }),
    post('p0000007-gggg', 'eve.nocity', { body: '' }),
  ];
  const r = renderSite(roster(), { ...base, pagesPosts: true, posts });
  const pages = [...r.files.keys()].filter((p) => p.includes('/posts/'));
  assert.equal(pages.length, 1);
  assert.deepEqual(r.result.skipped, { 'post-author-not-listed': 1, 'post-not-text': 3, 'post-contact-info': 2 });
  const opted = renderSite([attorney('ann.nyc', { seoOptIn: false })], { ...base, pagesPosts: true, posts: [post('p0000001-aaaa', 'ann.nyc')] });
  assert.equal([...opted.files.keys()].some((p) => p.includes('/posts/')), false, 'seoOptIn=false hides the attorney posts');
});

test('gate: a thin post is noindex and out of the sitemap even with the quality-gate switch off', () => {
  const posts = [post('p0000001-aaaa', 'ann.nyc'), post('p0000002-bbbb', 'ann.nyc', { title: 'Short note', body: 'Call a lawyer early.' }), post('p0000003-cccc', 'ann.nyc', { title: 'My practice', body: `${LONG} I am the best divorce attorney in the city.` })];
  const r = renderSite(roster(), { ...base, pagesPosts: true, posts, sitemapIndex: true });
  const thinPath = [...r.files.keys()].find((p) => p.includes('short-note'));
  const claimPath = [...r.files.keys()].find((p) => p.includes('my-practice'));
  assert.equal(robots(r.files.get(thinPath)), 'noindex,follow');
  assert.equal(robots(r.files.get(claimPath)), 'noindex,follow');
  assert.equal(robots(r.files.get(PW)), 'index,follow');
  assert.equal(r.result.noindex['thin-post'], 1);
  assert.equal(r.result.noindex['unverified-claim'], 1);
  const sm = locs(r.discovery.get('sitemaps/posts-1.xml'));
  assert.deepEqual(sm, [`${SITE}${PW}`]);
  assert.ok(locs(r.discovery.get('sitemap.xml')).includes(`${SITE}/sitemaps/posts-1.xml`));
  // The threshold is tunable.
  const loose = renderSite(roster(), { ...base, pagesPosts: true, posts, gate: { minPostChars: 10 } });
  assert.equal(robots(loose.files.get(thinPath)), 'index,follow');
});

test('the attorney profile links to its indexed posts only (and is unchanged without posts)', () => {
  const posts = [post('p0000001-aaaa', 'ann.nyc'), post('p0000002-bbbb', 'ann.nyc', { title: 'Short note', body: 'Too short.' })];
  const r = renderSite(roster(), { ...base, pagesPosts: true, posts });
  const html = r.files.get('/attorneys/ann.nyc/');
  assert.match(html, /<h2>Recent posts<\/h2>/);
  assert.equal([...html.matchAll(/href="\/attorneys\/ann\.nyc\/posts\//g)].length, 1);
});

// ---- cities ----
const HUB = '/lawyers/new-york/brooklyn/divorce/';
const practiceSlugOf = (r) => [...r.files.keys()].filter((p) => p.startsWith('/lawyers/new-york/brooklyn/'));

test('city hub: generated at 3 attorneys, not at 2; LegalService-family ItemList and links state <-> city <-> practice', () => {
  const r3 = renderSite(roster(), { ...base, pagesCities: true });
  const hubs = practiceSlugOf(r3);
  assert.ok(hubs.includes('/lawyers/new-york/brooklyn/'), hubs.join());
  const hubPath = hubs.find((p) => p.endsWith('family-law/'));
  assert.ok(hubPath, hubs.join());
  const html = r3.files.get(hubPath);
  assert.equal(canonical(html), `${SITE}${hubPath}`);
  assert.equal(robots(html), 'index,follow');
  const page = ldType(html, 'CollectionPage');
  assert.equal(page.areaServed['@type'], 'City');
  assert.equal(page.areaServed.containedInPlace.name, 'New York');
  assert.equal(page.mainEntity['@type'], 'ItemList');
  assert.equal(page.mainEntity.numberOfItems, 3);
  assert.deepEqual(page.mainEntity.itemListElement.map((i) => i.item['@type']), ['Attorney', 'Attorney', 'Attorney']);
  assert.equal(page.mainEntity.itemListElement[0].position, 1);
  assert.ok(ldType(html, 'FAQPage') && ldType(html, 'BreadcrumbList'));
  assert.match(html, /Attorney Advertising/); // New York
  // up: crumbs to state and city; sideways/down: state page, city page and the state x practice page link to it
  assert.deepEqual(ldType(html, 'BreadcrumbList').itemListElement.map((c) => c.item), [`${SITE}/lawyers/`, `${SITE}/lawyers/new-york/`, `${SITE}/lawyers/new-york/brooklyn/`, `${SITE}${hubPath}`]);
  assert.match(r3.files.get('/lawyers/new-york/'), /href="\/lawyers\/new-york\/brooklyn\/"/);
  assert.match(r3.files.get('/lawyers/new-york/brooklyn/'), new RegExp(`href="${hubPath}"`));
  assert.match(r3.files.get('/lawyers/new-york/family-law/'), new RegExp(`href="${hubPath}"`));
  assert.match(html, /href="\/lawyers\/new-york\/family-law\/"/);
  // only the three Brooklyn attorneys, never the Texas one or the one without a city
  assert.doesNotMatch(html, /Dan Tx|Eve Nocity/);

  const two = roster().filter((a) => a.username !== 'cat.nyc');
  const r2 = renderSite(two, { ...base, pagesCities: true });
  assert.deepEqual(practiceSlugOf(r2), [], 'two attorneys: no hub and no city page');
  assert.doesNotMatch(r2.files.get('/lawyers/new-york/'), /Cities in/);
  assert.equal(r2.result.cityPages, 0);
  // the threshold is a setting
  const lowered = renderSite(two, { ...base, pagesCities: true, gate: { minCityAttorneys: 2 } });
  assert.ok(practiceSlugOf(lowered).some((p) => p.endsWith('family-law/')));
});

test('city hub: an attorney who opted out, or is not licensed in the city state, does not count', () => {
  const rows = roster();
  rows[2] = attorney('cat.nyc', { city: 'Brooklyn', seoOptIn: false });
  assert.deepEqual(practiceSlugOf(renderSite(rows, { ...base, pagesCities: true })), []);
  rows[2] = attorney('cat.nyc', { city: 'Brooklyn', states: ['NJ'], cityState: 'NY' });
  assert.deepEqual(practiceSlugOf(renderSite(rows, { ...base, pagesCities: true })), []);
});

test('city hubs: own sitemap file, llms.txt section, city named like a practice is skipped', () => {
  const r = renderSite(roster(), { ...base, pagesCities: true, sitemapIndex: true, llms: true });
  const cities = locs(r.discovery.get('sitemaps/cities-1.xml'));
  assert.ok(cities.includes(`${SITE}/lawyers/new-york/brooklyn/`));
  assert.ok(cities.some((u) => u.endsWith('/brooklyn/family-law/')));
  assert.equal(locs(r.discovery.get('sitemaps/lawyers-1.xml')).some((u) => u.includes('/brooklyn/')), false);
  const llms = r.discovery.get('llms.txt');
  assert.match(llms, /## Cities\n- \[Lawyers in Brooklyn, NY\]\(https:\/\/example\.test\/lawyers\/new-york\/brooklyn\/\)/);
  assert.doesNotMatch(llms, /Ann Nyc/, 'no attorney names in llms.txt');
  const odd = roster().map((a) => (a.city === 'Brooklyn' ? { ...a, city: 'Family Law' } : a));
  assert.deepEqual([...renderSite(odd, { ...base, pagesCities: true }).files.keys()].filter((p) => p.includes('/family-law/family-law')), []);
});

// ---- legal questions ----
const QW = '/legal-questions/how-long-do-i-have-to-answer-a-divorce-summons-in-new-york-q0000001/';

test('legal question page: FAQPage JSON-LD, disclaimer, reviewed answer of a listed attorney, no asker data', () => {
  const q = question('q0000001-aaaa', [answer('a1', 'ann.nyc')]);
  const r = renderSite(roster(), { ...base, pagesQa: true, questions: [q] });
  const html = r.files.get(QW);
  assert.ok(html, [...r.files.keys()].filter((k) => k.includes('legal')).join());
  assert.equal(canonical(html), `${SITE}${QW}`);
  assert.equal(robots(html), 'index,follow');
  const faq = ldType(html, 'FAQPage');
  assert.equal(faq['@context'], 'https://schema.org');
  assert.equal(faq.mainEntity.length, 1);
  assert.equal(faq.mainEntity[0]['@type'], 'Question');
  assert.equal(faq.mainEntity[0].name, 'How long do I have to answer a divorce summons in New York?');
  assert.equal(faq.mainEntity[0].acceptedAnswer['@type'], 'Answer');
  assert.ok(faq.mainEntity[0].acceptedAnswer.text.length > 300);
  assert.equal(faq.mainEntity[0].acceptedAnswer.author.name, 'Ann Nyc');
  assert.match(html, /General information, not legal advice\./);
  assert.match(html, /attorney-client relationship/);
  assert.match(html, /Attorney Advertising/); // the answering attorney is licensed in NY
  assert.match(html, /href="\/practice-areas\/family-law\/"/);
  assert.match(html, /href="\/lawyers\/new-york\/family-law\/"/);
  assert.doesNotMatch(html, /authorId|author_id|anonymous/i);
});

test('legal questions: unreviewed answers, unlisted attorneys and contact data keep a question out', () => {
  const qs = [
    question('q0000001-aaaa', [answer('a1', 'ann.nyc')]),
    question('q0000002-bbbb', [answer('a2', 'ann.nyc', { reviewed: false })], { title: 'Unreviewed answer here' }),
    question('q0000003-cccc', [answer('a3', 'ghost')], { title: 'Unlisted attorney answer' }),
    question('q0000004-dddd', [answer('a4', 'ann.nyc', { body: `${LONG} My number is 212-555-0123.` })], { title: 'Phone in the answer' }),
    question('q0000005-eeee', [], { title: 'No answers at all' }),
  ];
  const r = renderSite(roster(), { ...base, pagesQa: true, questions: qs });
  assert.deepEqual([...r.files.keys()].filter((p) => p.startsWith('/legal-questions/') && p !== '/legal-questions/'), [QW]);
  assert.deepEqual(r.result.skipped, { 'qa-no-reviewed-answer': 3, 'qa-contact-info': 1 });
});

test('gate: a thin answer is noindex and out of the sitemap and the hub; a good one is listed everywhere', () => {
  const qs = [
    question('q0000001-aaaa', [answer('a1', 'ann.nyc')]),
    question('q0000002-bbbb', [answer('a2', 'ben.nyc', { body: 'Yes, you can.' })], { title: 'Can I file for divorce alone?' }),
  ];
  const r = renderSite(roster(), { ...base, pagesQa: true, questions: qs, sitemapIndex: true, llms: true });
  const thin = [...r.files.keys()].find((p) => p.includes('can-i-file'));
  assert.equal(robots(r.files.get(thin)), 'noindex,follow');
  assert.equal(r.result.noindex['thin-answer'], 1);
  assert.deepEqual(locs(r.discovery.get('sitemaps/legal-questions-1.xml')), [`${SITE}/legal-questions/`, `${SITE}${QW}`]);
  const hub = r.files.get('/legal-questions/');
  assert.match(hub, new RegExp(`href="${QW}"`));
  assert.doesNotMatch(hub, /can-i-file/);
  assert.equal(ldType(hub, 'CollectionPage').mainEntity.numberOfItems, 1);
  assert.match(r.files.get('/practice-areas/family-law/'), new RegExp(`Recent legal questions[\\s\\S]*${QW}`));
  assert.match(r.files.get('/lawyers/'), /href="\/legal-questions\/"/);
  assert.match(r.discovery.get('llms.txt'), /## Legal questions\n- \[Legal questions answered by verified attorneys\]\(https:\/\/example\.test\/legal-questions\/\): 1 question;/);
});

test('no hub and no llms section when no question passes the gate', () => {
  const r = renderSite(roster(), { ...base, pagesQa: true, llms: true, questions: [question('q0000002-bbbb', [answer('a2', 'ben.nyc', { body: 'Yes.' })])] });
  assert.equal(r.files.has('/legal-questions/'), false);
  assert.doesNotMatch(r.discovery.get('llms.txt'), /Legal questions/);
});

// ---- ramp, determinism, CLI ----
test('the ramp covers the new page types: a first run adopts, later new pages queue up', () => {
  const opts = { ...base, ...ON, rampPerDay: 1, manifest: true };
  const first = renderSite(roster(), { ...opts, posts: [post('p0000001-aaaa', 'ann.nyc')] });
  const prev = JSON.parse(first.discovery.get('seo-manifest.json'));
  assert.equal(prev.pages[PW].index, true);
  const next = renderSite(roster(), { ...opts, prev, buildDate: '2026-10-28', posts: [post('p0000001-aaaa', 'ann.nyc'), post('p0000002-bbbb', 'ann.nyc', { title: 'A second long post' }), post('p0000003-cccc', 'ann.nyc', { title: 'A third long post' })] });
  assert.equal(next.result.indexed, first.result.indexed + 1, 'one new page a day');
  assert.equal(next.result.noindex['ramp-deferred'], 1);
  assert.equal(next.result.rampDeferred, 1);
});

test('rendering is deterministic', () => {
  const o = { ...base, ...ON, sitemapIndex: true, llms: true, posts: [post('p0000001-aaaa', 'ann.nyc')], questions: [question('q0000001-aaaa', [answer('a1', 'ann.nyc')])] };
  const a = renderSite(roster(), o);
  const b = renderSite(roster(), o);
  assert.deepEqual([...a.files], [...b.files]);
  assert.deepEqual([...a.discovery], [...b.discovery]);
  assert.equal(a.result.postPages, 1);
  assert.equal(a.result.questionPages, 1);
  assert.ok(a.result.cityPages >= 2);
});

test('defaultGate carries the new thresholds from the plan', () => {
  assert.equal(defaultGate.minPostChars, 300);
  assert.equal(defaultGate.minQaChars, 300);
  assert.equal(defaultGate.minCityAttorneys, 3);
});

test('build.mjs renders the new types from an offline file when the switches are on, and nothing when they are off', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-pages-'));
  const file = join(dir, 'data.json');
  writeFileSync(file, JSON.stringify({ attorneys: roster(), posts: [post('p0000001-aaaa', 'ann.nyc')], questions: [question('q0000001-aaaa', [answer('a1', 'ann.nyc')])] }));
  const run = (args, env = {}) => {
    const out = join(dir, `out-${args.length}-${Object.keys(env).length}`);
    const stdout = execFileSync('node', [join(here, '..', 'build.mjs'), '--offline', file, '--site', SITE, '--out', out, '--date', '2026-10-27', ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
    return { out, stdout };
  };
  const off = run([]);
  assert.equal(existsSync(join(off.out, 'legal-questions')), false);
  assert.equal(existsSync(join(off.out, PW, 'index.html')), false);
  const flags = run(['--pages-posts', '--pages-qa', '--pages-cities', '--dry-run']);
  assert.match(flags.stdout, /"postPages": 1/);
  assert.match(flags.stdout, /"questionPages": 1/);
  const env = run([], { SEO_PAGES_POSTS: '1', SEO_PAGES_QA: 'true', SEO_PAGES_CITIES: 'on' });
  assert.ok(existsSync(join(env.out, PW, 'index.html')));
  assert.ok(existsSync(join(env.out, QW, 'index.html')));
  assert.ok(existsSync(join(env.out, 'lawyers/new-york/brooklyn/family-law/index.html')));
  assert.match(readFileSync(join(env.out, PW, 'index.html'), 'utf8'), /"@type":"Article"/);
});
