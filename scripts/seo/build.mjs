#!/usr/bin/env node
// Owner 2026-10-15 (web): the public, search-engine-readable pages of
// LawBid. The app itself is a Flutter canvas that search engines read
// poorly, so these are plain static HTML files built from our own data:
//
//   /lawyers/                       all states and practice areas
//   /lawyers/<state>/               one state
//   /lawyers/<state>/<practice>/    practice area x state (the long tail)
//   /practice-areas/<practice>/     one practice area
//   /attorneys/<username>/          a verified attorney's public profile
//   /sitemap.xml, /robots.txt
//
// Data: the public directory of the API (verified attorneys, public
// profile facts only), the practice-area text in data/practices.json and
// the keyword work in data/*.json. No case, client or contact data ever
// reaches these pages. A page with no attorneys says so honestly and
// invites the visitor to post a case; no profile is ever invented.
//
// Usage:
//   node scripts/seo/build.mjs --api https://api.example.com/api/v1 \
//        --site https://example.com --out dist-seo
//   node scripts/seo/build.mjs --offline fixture.json --site ... --out ...
// Flags: --index-empty  also index state x practice pages without attorneys
//        (by default only the high-demand states and pages with attorneys
//        are indexed; the rest are `noindex` and left out of the sitemap).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const SITE = (arg('site', 'https://lawbid.app') || '').replace(/\/+$/, '');
const OUT = arg('out', 'dist-seo');
const API = (arg('api', '') || '').replace(/\/+$/, '');
const OFFLINE = arg('offline', '');
const INDEX_EMPTY = flag('index-empty');
const BUILD_DATE = arg('date', new Date().toISOString().slice(0, 10));
const APP = SITE; // the web app lives on the same host

const json = async (f) => JSON.parse(await readFile(join(here, 'data', f), 'utf8'));
const PRACTICES = await json('practices.json');
const STATES = await json('states.json');
const HIGH = await json('high_demand.json');
const TOP_STATES = new Set(Object.values(HIGH).flat());

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const stateList = Object.entries(STATES).map(([code, name]) => ({ code, name, slug: slugify(name) }));
const stateBy = Object.fromEntries(stateList.map((s) => [s.code, s]));

async function loadAttorneys() {
  if (OFFLINE) return JSON.parse(await readFile(OFFLINE, 'utf8')).attorneys;
  if (!API) throw new Error('--api or --offline is required');
  const all = [];
  let cursor = '';
  for (let page = 0; page < 500; page++) {
    const res = await fetch(`${API}/public/directory/attorneys?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!res.ok) throw new Error(`directory ${res.status}`);
    const body = await res.json();
    all.push(...body.data);
    cursor = body.meta?.nextCursor ?? '';
    if (!cursor) break;
  }
  return all;
}

const matches = (a, practice) =>
  a.practiceAreas.some((p) => p.code === practice.code || p.code.startsWith(`${practice.code}.`));

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#14213d;--muted:#5c677d;--line:#e3e6ee;--gold:#a8832f;--card:#f7f8fb}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#eef1f7;--muted:#9aa4b8;--line:#232a36;--gold:#d4af5a;--card:#161b24}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--gold)}header,main,footer{max-width:820px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;padding-top:18px;padding-bottom:18px;border-bottom:1px solid var(--line)}
header .brand{font-weight:700;font-size:20px;color:var(--fg);text-decoration:none}nav a{margin-left:16px;font-size:15px}
h1{font-size:30px;line-height:1.2;margin:28px 0 8px}h2{font-size:21px;margin:30px 0 10px}p.lead{color:var(--muted);font-size:18px;margin:0 0 18px}
.cta{display:inline-block;background:var(--fg);color:var(--bg);padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;margin:6px 0}
.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:16px 0}
.card{display:block;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0;text-decoration:none;color:var(--fg)}
.card strong{display:block}.card small{display:block;color:var(--muted)}ul.cols{columns:2;padding-left:18px}ul.cols li{break-inside:avoid;margin:3px 0}
.crumbs{font-size:14px;color:var(--muted);margin-top:16px}.crumbs a{color:var(--muted)}
details{border-top:1px solid var(--line);padding:10px 0}summary{cursor:pointer;font-weight:600}
footer{color:var(--muted);font-size:14px;padding-top:24px;padding-bottom:40px;border-top:1px solid var(--line);margin-top:40px}
@media (max-width:560px){ul.cols{columns:1}h1{font-size:26px}}
`;

function layout({ title, description, path, body, robots = 'index,follow', jsonld = [], crumbs = [] }) {
  const url = `${SITE}${path}`;
  const ld = [
    ...jsonld,
    ...(crumbs.length
      ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE}${c.path}` })) }]
      : []),
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="LawBid">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}">
<style>${CSS}</style>
${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head><body>
<header><a class="brand" href="${APP}/">LawBid</a><nav><a href="/lawyers/">Find a lawyer</a><a href="${APP}/">Open the app</a></nav></header>
<main>
${crumbs.length ? `<p class="crumbs">${crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${c.path}">${esc(c.name)}</a>` : esc(c.name))).join(' › ')}</p>` : ''}
${body}
</main>
<footer>
<p>LawBid is a marketplace where people post their legal matter and attorneys licensed in their state respond. LawBid is not a law firm, does not give legal advice and does not guarantee any result. Information on this page is general and not a substitute for advice from a licensed attorney.</p>
<p><a href="${APP}/legal/terms">Terms</a> · <a href="${APP}/legal/privacy">Privacy</a></p>
</footer>
</body></html>
`;
}

const cta = (text) => `<p><a class="cta" href="${APP}/">${esc(text)}</a></p>`;

function attorneyCard(a) {
  const meta = [
    a.firmNames[0],
    a.ratingCount > 0 ? `★ ${a.ratingAvg.toFixed(1)} (${a.ratingCount})` : 'New on LawBid',
    a.languages.length ? `Languages: ${a.languages.join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  return `<a class="card" href="/attorneys/${esc(a.username)}/"><strong>${esc(a.displayName)}${a.trustBadge ? ' ✔' : ''}</strong><small>${esc(meta)}</small>${a.bio ? `<small>${esc(a.bio.slice(0, 160))}</small>` : ''}</a>`;
}

const faqLd = (qa) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const faqHtml = (qa) => qa.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');

export async function build() {
  const attorneys = await loadAttorneys();
  const files = new Map(); // path -> html
  const urls = []; // indexable [path, priority]
  const put = (path, html, { index = true, priority = '0.5' } = {}) => {
    files.set(path, html);
    if (index) urls.push([path, priority]);
  };

  const inState = (code) => attorneys.filter((a) => a.licensedStates.includes(code));
  const forPractice = (list, p) => list.filter((a) => matches(a, p));

  // Home of the directory.
  put('/lawyers/', layout({
    title: 'Find a licensed lawyer by state and practice area | LawBid',
    description: 'Browse licensed attorneys by state and practice area, or post your legal matter on LawBid and let attorneys licensed in your state respond.',
    path: '/lawyers/',
    crumbs: [{ name: 'Home', path: '/lawyers/' }],
    body: `<h1>Find a licensed lawyer</h1>
<p class="lead">Choose your state or the kind of legal help you need. Attorneys on LawBid are verified before they are listed.</p>
${cta('Post your case — free')}
<h2>By state</h2><ul class="cols">${stateList.map((s) => `<li><a href="/lawyers/${s.slug}/">${esc(s.name)}</a></li>`).join('')}</ul>
<h2>By practice area</h2><ul class="cols">${PRACTICES.map((p) => `<li><a href="/practice-areas/${p.slug}/">${esc(p.name)}</a></li>`).join('')}</ul>`,
  }), { priority: '0.9' });

  // Practice-area pages (national).
  for (const p of PRACTICES) {
    const list = forPractice(attorneys, p);
    const path = `/practice-areas/${p.slug}/`;
    put(path, layout({
      title: `${p.name} lawyers: how it works and how to find one | LawBid`,
      description: `${p.intro} Find a licensed ${p.name.toLowerCase()} attorney in your state or post your matter on LawBid.`.slice(0, 300),
      path,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: p.name, path }],
      jsonld: [faqLd(p.faq)],
      body: `<h1>${esc(p.name)} lawyers</h1><p class="lead">${esc(p.intro)}</p>
${cta('Post your case — free')}
<h2>Common situations</h2><ul>${p.situations.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
${list.length ? `<h2>Attorneys on LawBid</h2>${list.slice(0, 12).map(attorneyCard).join('')}` : ''}
<h2>Find a ${esc(p.name.toLowerCase())} lawyer by state</h2><ul class="cols">${stateList.map((s) => `<li><a href="/lawyers/${s.slug}/${p.slug}/">${esc(s.name)}</a></li>`).join('')}</ul>
<h2>Questions people ask</h2>${faqHtml(p.faq)}`,
    }), { priority: '0.7' });
  }

  // State pages and state x practice pages.
  for (const s of stateList) {
    const stateAttorneys = inState(s.code);
    const spath = `/lawyers/${s.slug}/`;
    put(spath, layout({
      title: `Lawyers in ${s.name} by practice area | LawBid`,
      description: `Find a licensed attorney in ${s.name}. Browse practice areas or post your legal matter on LawBid and let attorneys licensed in ${s.name} respond.`,
      path: spath,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: s.name, path: spath }],
      body: `<h1>Lawyers in ${esc(s.name)}</h1>
<p class="lead">Pick the kind of legal help you need in ${esc(s.name)}.</p>
${cta('Post your case — free')}
<h2>Practice areas</h2><ul class="cols">${PRACTICES.map((p) => `<li><a href="/lawyers/${s.slug}/${p.slug}/">${esc(p.name)} lawyers</a></li>`).join('')}</ul>
${stateAttorneys.length ? `<h2>Attorneys licensed in ${esc(s.name)}</h2>${stateAttorneys.slice(0, 12).map(attorneyCard).join('')}` : ''}`,
    }), { index: TOP_STATES.has(s.code) || stateAttorneys.length > 0 || INDEX_EMPTY, priority: '0.8' });

    for (const p of PRACTICES) {
      const list = forPractice(stateAttorneys, p);
      const path = `/lawyers/${s.slug}/${p.slug}/`;
      const index = list.length > 0 || TOP_STATES.has(s.code) || INDEX_EMPTY;
      const others = PRACTICES.filter((o) => o.slug !== p.slug).slice(0, 6);
      put(path, layout({
        title: `${p.name} lawyers in ${s.name} | LawBid`,
        description: `Looking for a ${p.name.toLowerCase()} lawyer in ${s.name}? Post your matter on LawBid and licensed ${s.name} attorneys can respond with offers. ${list.length ? `${list.length} verified attorney${list.length === 1 ? '' : 's'} listed.` : ''}`.trim(),
        path,
        robots: index ? 'index,follow' : 'noindex,follow',
        crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: s.name, path: spath }, { name: p.name, path }],
        jsonld: [faqLd(p.faq)],
        body: `<h1>${esc(p.name)} lawyers in ${esc(s.name)}</h1>
<p class="lead">${esc(p.intro)}</p>
${list.length
          ? `<h2>Verified ${esc(p.name.toLowerCase())} attorneys licensed in ${esc(s.name)}</h2>${list.slice(0, 20).map(attorneyCard).join('')}${cta('Post your case — free')}`
          : `<div class="box"><strong>No ${esc(p.name.toLowerCase())} attorney licensed in ${esc(s.name)} is listed here yet.</strong>
<p>You can still describe your matter on LawBid. It is free to post, and attorneys licensed in ${esc(s.name)} who take this kind of case can respond with their offers.</p>${cta('Post your case — free')}</div>`}
<h2>Common situations</h2><ul>${p.situations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<h2>How it works</h2><ol><li>Describe your matter and choose ${esc(s.name)}.</li><li>Licensed attorneys respond with offers.</li><li>You compare them and choose who to talk to.</li></ol>
<h2>Questions people ask</h2>${faqHtml(p.faq)}
<h2>More legal help in ${esc(s.name)}</h2><ul class="cols">${others.map((o) => `<li><a href="/lawyers/${s.slug}/${o.slug}/">${esc(o.name)}</a></li>`).join('')}<li><a href="${spath}">All practice areas in ${esc(s.name)}</a></li><li><a href="/practice-areas/${p.slug}/">${esc(p.name)} in every state</a></li></ul>`,
      }), { index, priority: list.length ? '0.8' : '0.4' });
    }
  }

  // Attorney profiles.
  for (const a of attorneys) {
    const path = `/attorneys/${a.username}/`;
    const states = a.licensedStates.map((c) => stateBy[c]?.name ?? c);
    put(path, layout({
      title: `${a.displayName}, attorney${states.length ? ` in ${states.slice(0, 2).join(' & ')}` : ''} | LawBid`,
      description: `${a.displayName} is a verified attorney on LawBid${states.length ? `, licensed in ${states.join(', ')}` : ''}${a.practiceAreas.length ? `, practicing ${a.practiceAreas.slice(0, 3).map((p) => p.name).join(', ')}` : ''}.`.slice(0, 300),
      path,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: a.displayName, path }],
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'Attorney', name: a.displayName, url: `${SITE}${path}`,
        ...(a.bio ? { description: a.bio } : {}),
        ...(states.length ? { areaServed: states.map((n) => ({ '@type': 'State', name: n })) } : {}),
        knowsAbout: a.practiceAreas.map((p) => p.name),
        ...(a.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: a.ratingAvg, reviewCount: a.ratingCount } } : {}),
      }],
      body: `<h1>${esc(a.displayName)}${a.trustBadge ? ' ✔' : ''}</h1>
<p class="lead">Verified attorney on LawBid${states.length ? `, licensed in ${esc(states.join(', '))}` : ''}.</p>
${a.bio ? `<p>${esc(a.bio)}</p>` : ''}
${a.firmNames.length ? `<p><strong>Firm:</strong> ${esc(a.firmNames.join(', '))}</p>` : ''}
${a.languages.length ? `<p><strong>Languages:</strong> ${esc(a.languages.join(', '))}</p>` : ''}
${a.ratingCount > 0 ? `<p><strong>Rating:</strong> ${a.ratingAvg.toFixed(1)} from ${a.ratingCount} review${a.ratingCount === 1 ? '' : 's'}</p>` : ''}
${a.practiceAreas.length ? `<h2>Practice areas</h2><ul class="cols">${a.practiceAreas.map((p) => `<li>${esc(p.name)}</li>`).join('')}</ul>` : ''}
${cta(`Post a case for ${a.displayName.split(' ')[0] || 'this attorney'} on LawBid`)}
<p><a href="${APP}/lawyer/${esc(a.username)}">Open the full profile in the LawBid app</a></p>`,
    }), { priority: '0.6' });
  }

  // Write.
  await rm(OUT, { recursive: true, force: true });
  for (const [path, html] of files) {
    const file = join(OUT, path, 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([p, pr]) => `<url><loc>${esc(SITE + p)}</loc><lastmod>${BUILD_DATE}</lastmod><priority>${pr}</priority></url>`)
    .join('\n')}\n</urlset>\n`;
  await writeFile(join(OUT, 'sitemap.xml'), sitemap);
  await writeFile(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  return { pages: files.size, indexed: urls.length, attorneys: attorneys.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  console.log(`seo: ${r.pages} pages (${r.indexed} indexed in the sitemap), ${r.attorneys} attorneys → ${OUT}`);
}
