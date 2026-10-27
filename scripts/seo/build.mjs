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
//   (optional, off by default) /sitemaps/*.xml, /llms.txt, /llms-full.txt,
//   /seo-manifest.json
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
//
// Switches (a flag or an environment variable; all OFF by default, so the
// public output stays as it was until the owner turns one on):
//   --sitemap-index        SEO_SITEMAP_INDEX=1   /sitemap.xml becomes an index of
//                          /sitemaps/<type>-<n>.xml (<= SEO_SITEMAP_MAX urls, 10000, never above 50000)
//   --robots-ai            SEO_ROBOTS_AI=1       robots.txt: search and answer bots in, training bots out
//                          (SEO_AI_TRAINING=allow lets the training bots in as well)
//   --llms                 SEO_LLMS=1            /llms.txt and /llms-full.txt from the same data
//   --quality-gate         SEO_QUALITY_GATE=1    thin pages become noindex and leave the sitemaps
//                          (SEO_MIN_WORDS 300, SEO_MIN_ATTORNEYS 3, SEO_MIN_BIO_CHARS 150)
//   --ramp-per-day N       SEO_RAMP_PER_DAY=N    at most N new pages a day enter the index
//   --prev-manifest FILE   SEO_PREV_MANIFEST     the previous seo-manifest.json (real lastmod, ramp state)
//   --manifest             SEO_INCREMENTAL=1     write seo-manifest.json (content hashes)
//   --dry-run                                    decide everything, print the summary, write nothing
// Always on: no aggregateRating in the attorney JSON-LD; lastmod is the
// entity's updatedAt when the data has it, else the day the page's content
// last changed (from the previous manifest), else the build day.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITEMAP_HARD_LIMIT, clampMax, llmsFullTxt, llmsTxt, robotsTxt, sitemapIndex, urlset } from './lib/discovery.mjs';
import { applyRamp, defaultGate, gateDecision, mainText, wordCount } from './lib/gate.mjs';
import { MANIFEST_NAME, sha256 } from './lib/manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const on = (name, env) => flag(name) || /^(1|true|yes|on)$/i.test(process.env[env] ?? '');
const num = (name, env, fallback) => {
  const v = Number.parseInt(arg(name, process.env[env] ?? ''), 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

const SITE = (arg('site', 'https://lawbid.app') || '').replace(/\/+$/, '');
const OUT = arg('out', 'dist-seo');
const API = (arg('api', '') || '').replace(/\/+$/, '');
const OFFLINE = arg('offline', '');
const INDEX_EMPTY = flag('index-empty');
const BUILD_DATE = arg('date', new Date().toISOString().slice(0, 10));
const APP = SITE; // the web app lives on the same host
const DRY = flag('dry-run');
const SITEMAP_INDEX = on('sitemap-index', 'SEO_SITEMAP_INDEX');
const ROBOTS_AI = on('robots-ai', 'SEO_ROBOTS_AI');
const ALLOW_TRAINING = (process.env.SEO_AI_TRAINING ?? '') === 'allow';
const LLMS = on('llms', 'SEO_LLMS');
const RAMP = num('ramp-per-day', 'SEO_RAMP_PER_DAY', 0);
const RAMP_BASELINE = (arg('ramp-baseline', process.env.SEO_RAMP_BASELINE ?? 'all') === 'none') ? 'none' : 'all';
const MANIFEST = on('manifest', 'SEO_INCREMENTAL') || RAMP > 0;
const GATE = {
  ...defaultGate,
  enabled: on('quality-gate', 'SEO_QUALITY_GATE'),
  minWords: num('min-words', 'SEO_MIN_WORDS', defaultGate.minWords),
  minAttorneys: num('min-attorneys', 'SEO_MIN_ATTORNEYS', defaultGate.minAttorneys),
  minBioChars: num('min-bio-chars', 'SEO_MIN_BIO_CHARS', defaultGate.minBioChars),
};
const SITEMAP_MAX = clampMax(arg('sitemap-max', process.env.SEO_SITEMAP_MAX));
const PREV_FILE = arg('prev-manifest', process.env.SEO_PREV_MANIFEST ?? '');

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

// Owner 2026-10-22 (audit #4 §9, ogp.me): og:image must be an absolute URL;
// the brand image is the fallback, an attorney page uses the photo.
const BRAND_IMAGE = `${SITE}/icons/Icon-512.png`;

function layout({ title, description, path, body, robots = 'index,follow', jsonld = [], crumbs = [], image = BRAND_IMAGE }) {
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
<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="${image === BRAND_IMAGE ? 'summary' : 'summary_large_image'}"><meta name="twitter:image" content="${esc(image)}">
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

/** An https photo URL, else the brand image (og:image must be absolute). */
export const absoluteImage = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : BRAND_IMAGE);

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

/** 'YYYY-MM-DD' of an ISO timestamp, never later than the build day; null when unusable. */
export function dayOf(v, today) {
  const t = typeof v === 'string' || v instanceof Date ? new Date(v) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const d = t.toISOString().slice(0, 10);
  return d > today ? today : d;
}
const newest = (list) => list.map((a) => a.updatedAt ?? a.updated_at).filter(Boolean).sort().pop();

async function loadPrevManifest() {
  if (!PREV_FILE) return null;
  try {
    return JSON.parse(await readFile(PREV_FILE, 'utf8'));
  } catch {
    return null; // first run, or the file is not there yet
  }
}

export async function build() {
  const attorneys = await loadAttorneys();
  const prev = await loadPrevManifest();
  const entries = []; // every page: path, kind, render(robots), options
  const put = (path, kind, render, opts = {}) => entries.push({ path, kind, render, ...opts });

  const inState = (code) => attorneys.filter((a) => a.licensedStates.includes(code));
  const forPractice = (list, p) => list.filter((a) => matches(a, p));

  // Home of the directory.
  put('/lawyers/', 'hub', (robots) => layout({ robots,
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
    put(path, 'page', (robots) => layout({ robots,
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
    }), { priority: '0.7', updatedAt: newest(list.slice(0, 12)) });
  }

  // State pages and state x practice pages.
  for (const s of stateList) {
    const stateAttorneys = inState(s.code);
    const spath = `/lawyers/${s.slug}/`;
    put(spath, 'page', (robots) => layout({ robots,
      title: `Lawyers in ${s.name} by practice area | LawBid`,
      description: `Find a licensed attorney in ${s.name}. Browse practice areas or post your legal matter on LawBid and let attorneys licensed in ${s.name} respond.`,
      path: spath,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: s.name, path: spath }],
      body: `<h1>Lawyers in ${esc(s.name)}</h1>
<p class="lead">Pick the kind of legal help you need in ${esc(s.name)}.</p>
${cta('Post your case — free')}
<h2>Practice areas</h2><ul class="cols">${PRACTICES.map((p) => `<li><a href="/lawyers/${s.slug}/${p.slug}/">${esc(p.name)} lawyers</a></li>`).join('')}</ul>
${stateAttorneys.length ? `<h2>Attorneys licensed in ${esc(s.name)}</h2>${stateAttorneys.slice(0, 12).map(attorneyCard).join('')}` : ''}`,
    }), { updatedAt: newest(stateAttorneys.slice(0, 12)), attorneyCount: stateAttorneys.length, index: TOP_STATES.has(s.code) || stateAttorneys.length > 0 || INDEX_EMPTY, priority: '0.8' });

    for (const p of PRACTICES) {
      const list = forPractice(stateAttorneys, p);
      const path = `/lawyers/${s.slug}/${p.slug}/`;
      const index = list.length > 0 || TOP_STATES.has(s.code) || INDEX_EMPTY;
      const others = PRACTICES.filter((o) => o.slug !== p.slug).slice(0, 6);
      put(path, 'combo', (robots) => layout({ robots,
        title: `${p.name} lawyers in ${s.name} | LawBid`,
        description: `Looking for a ${p.name.toLowerCase()} lawyer in ${s.name}? Post your matter on LawBid and licensed ${s.name} attorneys can respond with offers. ${list.length ? `${list.length} verified attorney${list.length === 1 ? '' : 's'} listed.` : ''}`.trim(),
        path,
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
      }), { index, priority: list.length ? '0.8' : '0.4', attorneyCount: list.length, updatedAt: newest(list.slice(0, 20)) });
    }
  }

  // Attorney profiles.
  for (const a of attorneys) {
    // Owner 2026-10-22: lower case — the link the API hands the app
    // (profile `publicUrl`) is /attorneys/<username lower case>/.
    const path = `/attorneys/${encodeURIComponent(a.username.toLowerCase())}/`;
    const states = a.licensedStates.map((c) => stateBy[c]?.name ?? c);
    put(path, 'profile', (robots) => layout({ robots,
      title: `${a.displayName}, attorney${states.length ? ` in ${states.slice(0, 2).join(' & ')}` : ''} | LawBid`,
      description: `${a.displayName} is a verified attorney on LawBid${states.length ? `, licensed in ${states.join(', ')}` : ''}${a.practiceAreas.length ? `, practicing ${a.practiceAreas.slice(0, 3).map((p) => p.name).join(', ')}` : ''}.`.slice(0, 300),
      path,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: a.displayName, path }],
      image: absoluteImage(a.photoUrl),
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'Attorney', name: a.displayName, url: `${SITE}${path}`,
        ...(absoluteImage(a.photoUrl) !== BRAND_IMAGE ? { image: absoluteImage(a.photoUrl) } : {}),
        ...(a.bio ? { description: a.bio } : {}),
        ...(states.length ? { areaServed: states.map((n) => ({ '@type': 'State', name: n })) } : {}),
        knowsAbout: a.practiceAreas.map((p) => p.name),
        // No aggregateRating: the page shows no individual reviews, and Google
        // only accepts review/rating markup for reviews visible on the page.
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
    }), { priority: '0.6', bio: a.bio, claimsText: [a.bio, a.displayName, ...a.firmNames].join(' '), updatedAt: a.updatedAt ?? a.updated_at });
  }

  // Decide: the generator's own rule, then the quality gate, then the ramp.
  const INDEXED = 'index,follow';
  const NOINDEX = 'noindex,follow';
  for (const e of entries) {
    const base = e.index ?? true;
    const pre = base ? e.render(INDEXED) : null;
    const d = gateDecision({
      kind: e.kind,
      baseIndex: base,
      words: GATE.enabled && pre ? wordCount(mainText(pre)) : 0,
      attorneyCount: e.attorneyCount ?? 0,
      bio: e.bio,
      claimsText: e.claimsText,
      gate: GATE,
    });
    e.indexed = d.index;
    e.reason = d.reason;
    e.html = d.index ? pre : null;
  }
  let ramp = null;
  if (RAMP > 0) {
    ramp = applyRamp({
      candidates: entries.filter((e) => e.indexed).map((e) => ({ path: e.path, priority: e.priority ?? '0.5' })),
      prev,
      today: BUILD_DATE,
      perDay: RAMP,
      baseline: RAMP_BASELINE,
    });
    for (const e of entries) {
      if (!e.indexed) continue;
      if (ramp.admitted.has(e.path)) e.admitted = ramp.admitted.get(e.path);
      else {
        e.indexed = false;
        e.reason = 'ramp-deferred';
        e.html = null;
      }
    }
  }

  // Final pages, content hashes and the real lastmod.
  const prevPages = prev?.pages ?? {};
  const files = new Map(); // path -> html
  const map = {}; // manifest pages
  const sitemapEntries = [];
  const noindex = {};
  for (const e of entries) {
    const html = e.html ?? e.render(NOINDEX);
    files.set(e.path, html);
    const hash = sha256(html);
    const before = prevPages[e.path];
    const lastmod = before && before.hash === hash && before.lastmod ? before.lastmod : (dayOf(e.updatedAt, BUILD_DATE) ?? BUILD_DATE);
    map[e.path] = { hash, lastmod, index: e.indexed, ...(e.admitted ? { admitted: e.admitted } : {}) };
    if (e.indexed) sitemapEntries.push({ path: e.path, lastmod, priority: e.priority ?? '0.5' });
    else noindex[e.reason ?? 'noindex'] = (noindex[e.reason ?? 'noindex'] ?? 0) + 1;
  }

  // Discovery files.
  const useIndex = SITEMAP_INDEX || sitemapEntries.length > SITEMAP_HARD_LIMIT;
  const discovery = new Map(); // relative file -> text
  if (useIndex) {
    const idx = sitemapIndex({ site: SITE, entries: sitemapEntries, max: SITEMAP_MAX });
    discovery.set('sitemap.xml', idx.index);
    for (const [name, xml] of idx.files) discovery.set(name, xml);
  } else {
    discovery.set('sitemap.xml', urlset(SITE, sitemapEntries));
  }
  discovery.set('robots.txt', robotsTxt({ site: SITE, ai: ROBOTS_AI, allowTraining: ALLOW_TRAINING }));
  if (LLMS) {
    const listed = new Set(sitemapEntries.map((x) => x.path));
    const practices = PRACTICES.filter((p) => listed.has(`/practice-areas/${p.slug}/`));
    const states = stateList.filter((st) => listed.has(`/lawyers/${st.slug}/`));
    discovery.set('llms.txt', llmsTxt({ site: SITE, practices, states, attorneyCount: attorneys.length }));
    discovery.set('llms-full.txt', llmsFullTxt({ site: SITE, practices }));
  }
  if (MANIFEST) {
    const m = { version: 1, builtAt: BUILD_DATE, pages: map };
    if (RAMP > 0) m.ramp = { perDay: RAMP, date: BUILD_DATE, deferred: ramp.deferred.length };
    discovery.set(MANIFEST_NAME, JSON.stringify(m));
  }

  const result = {
    pages: files.size,
    indexed: sitemapEntries.length,
    attorneys: attorneys.length,
    noindex,
    sitemapFiles: useIndex ? [...discovery.keys()].filter((k) => k.startsWith('sitemaps/')).length : 1,
    discovery: [...discovery.keys()],
    rampDeferred: ramp ? ramp.deferred.length : 0,
    dryRun: DRY,
  };
  if (DRY) return result;

  await rm(OUT, { recursive: true, force: true });
  for (const [path, html] of files) {
    const file = join(OUT, path, 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  for (const [name, text] of discovery) {
    const file = join(OUT, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  console.log(`seo${r.dryRun ? ' (dry run, nothing written)' : ''}: ${r.pages} pages (${r.indexed} indexed in the sitemap), ${r.attorneys} attorneys → ${OUT}`);
  if (r.dryRun) console.log(JSON.stringify({ noindex: r.noindex, rampDeferred: r.rampDeferred, sitemapFiles: r.sitemapFiles, files: r.discovery }, null, 2));
}
