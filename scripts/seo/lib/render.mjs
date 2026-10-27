// The pure part of the static-page generator: attorneys in, files out.
// No network, no database, no disk write: scripts/seo/build.mjs (the CLI and
// the GitHub workflow) and the API's `seo.generate` job (BullMQ, nightly and
// on publish events) both call renderSite(), so the two can never drift
// apart. The switches (all OFF by default) arrive as plain options; build.mjs
// documents what each one does.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITEMAP_HARD_LIMIT, clampMax, llmsFullTxt, llmsTxt, robotsTxt, sitemapIndex, urlset } from './discovery.mjs';
import { applyRamp, defaultGate, gateDecision, hasContactInfo, mainText, wordCount } from './gate.mjs';
import { MANIFEST_NAME, sha256 } from './manifest.mjs';

export { clampMax, defaultGate };

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const json = async (f) => JSON.parse(await readFile(join(dataDir, f), 'utf8'));
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

// Owner 2026-10-22 (audit #4 §9, ogp.me): og:image must be an absolute URL;
// the brand image is the fallback, an attorney page uses the photo.
const brandImage = (site) => `${site}/icons/Icon-512.png`;

function layoutWith(SITE, { title, description, path, body, robots = 'index,follow', jsonld = [], crumbs = [], image, ogType = 'website' }) {
  const APP = SITE; // the web app lives on the same host
  const BRAND_IMAGE = brandImage(SITE);
  image ??= BRAND_IMAGE;
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
<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="LawBid">
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

// Helpers of the page types added 2026-10-27 (attorney posts, city hubs, legal Q&A).
const plain = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
const paragraphs = (text) =>
  String(text)
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
/** Readable keyword slug plus the first 8 characters of the id: the id keeps it unique and stable. */
const slugWithId = (text, id, fallback) => {
  const base = slugify(plain(text)).slice(0, 60).replace(/-+$/, '');
  return `${base || fallback}-${String(id).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8)}`;
};
const isoOrNull = (v) => {
  const t = typeof v === 'string' || v instanceof Date ? new Date(v) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString() : null;
};
const practiceOf = (code) => (code ? PRACTICES.find((p) => code === p.code || String(code).startsWith(`${p.code}.`)) : undefined);
const profilePath = (a) => `/attorneys/${encodeURIComponent(a.username.toLowerCase())}/`;
const NOT_ADVICE =
  '<div class="box"><strong>General information, not legal advice.</strong> Nothing on this page creates an attorney-client relationship. Rules and deadlines differ by state and by case; talk to an attorney licensed in your state about your own situation.</div>';
const AD_BOX = '<div class="box"><strong>Attorney Advertising.</strong> Prior results do not guarantee a similar outcome.</div>';

/** 'YYYY-MM-DD' of an ISO timestamp, never later than the build day; null when unusable. */
export function dayOf(v, today) {
  const t = typeof v === 'string' || v instanceof Date ? new Date(v) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const d = t.toISOString().slice(0, 10);
  return d > today ? today : d;
}
const newest = (list) => list.map((a) => a.updatedAt ?? a.updated_at).filter(Boolean).sort().pop();

/**
 * attorneys: the public directory rows (see PublicAttorneyDto);
 * opts: { site, buildDate, indexEmpty, sitemapIndex, robotsAi, allowTraining,
 *   llms, rampPerDay, rampBaseline, manifest, gate, sitemapMax, prev,
 *   pagesPosts, pagesCities, pagesQa, adLabel, posts, questions }.
 * The last six belong to the page types of 2026-10-27, all OFF unless asked:
 *   pagesPosts   /attorneys/<username>/posts/<slug>/ from `posts` (text posts of listed attorneys)
 *   pagesCities  /lawyers/<state>/<city>/ and .../<city>/<practice>/ from `city`/`cityState` of the attorney rows
 *                (a hub exists only with >= gate.minCityAttorneys attorneys of that practice in that city)
 *   pagesQa      /legal-questions/<slug>/ and the /legal-questions/ hub from `questions` (reviewed answers only)
 *   adLabel      'ny' (default): "Attorney Advertising" box where a listed attorney is licensed in New York; 'off'
 * A row with `seoOptIn === false` is left out of those types (the consent field, once it exists).
 * Returns { files: Map<path, html>, discovery: Map<file, text>, result }.
 * Synchronous and free of side effects.
 */
export function renderSite(attorneys, opts) {
  const SITE = (opts.site || 'https://lawbid.app').replace(/\/+$/, '');
  const APP = SITE; // the web app lives on the same host
  const BRAND_IMAGE = brandImage(SITE);
  const BUILD_DATE = opts.buildDate ?? new Date().toISOString().slice(0, 10);
  const INDEX_EMPTY = !!opts.indexEmpty;
  const SITEMAP_INDEX = !!opts.sitemapIndex;
  const ROBOTS_AI = !!opts.robotsAi;
  const ALLOW_TRAINING = !!opts.allowTraining;
  const LLMS = !!opts.llms;
  const RAMP = opts.rampPerDay > 0 ? opts.rampPerDay : 0;
  const RAMP_BASELINE = opts.rampBaseline === 'none' ? 'none' : 'all';
  const MANIFEST = !!opts.manifest || RAMP > 0;
  const GATE = { ...defaultGate, ...(opts.gate ?? {}) };
  const SITEMAP_MAX = clampMax(opts.sitemapMax);
  const prev = opts.prev ?? null;
  const PAGES_POSTS = !!opts.pagesPosts;
  const PAGES_CITIES = !!opts.pagesCities;
  const PAGES_QA = !!opts.pagesQa;
  const AD_LABEL = opts.adLabel !== 'off';
  const layout = (o) => layoutWith(SITE, o);
  /** An https photo URL, else the brand image (og:image must be absolute). */
  const absoluteImage = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : BRAND_IMAGE);
  const cta = (text) => `<p><a class="cta" href="${APP}/">${esc(text)}</a></p>`;

  const entries = []; // every page: path, kind, render(robots), options
  const put = (path, kind, render, opts = {}) => entries.push({ path, kind, render, ...opts });

  const inState = (code) => attorneys.filter((a) => a.licensedStates.includes(code));
  const forPractice = (list, p) => list.filter((a) => matches(a, p));

  // ---- Page types of 2026-10-27: prepare the data first (the older pages link to it). ----
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const publicOk = (a) => a.seoOptIn !== false;
  const listed = new Map(attorneys.filter(publicOk).map((a) => [a.username.toLowerCase(), a]));
  const adBox = (list) => (AD_LABEL && list.some((a) => a.licensedStates.includes('NY')) ? AD_BOX : '');
  const newestFirst = (a, b) => (String(b.at) > String(a.at) ? 1 : String(b.at) < String(a.at) ? -1 : a.path < b.path ? -1 : 1);

  // Text posts of listed attorneys.
  const postPages = [];
  if (PAGES_POSTS) {
    const seen = new Set();
    for (const p of opts.posts ?? []) {
      const author = listed.get(String(p.authorUsername ?? '').toLowerCase());
      const body = String(p.body ?? '').trim();
      if (!author) { skip('post-author-not-listed'); continue; }
      if (!body || p.hasMedia || p.videoId || p.seoOptIn === false) { skip('post-not-text'); continue; }
      if (hasContactInfo(`${p.title ?? ''}\n${body}`)) { skip('post-contact-info'); continue; }
      const path = `${profilePath(author)}posts/${slugWithId(p.title || body, p.id, 'post')}/`;
      if (seen.has(path)) continue;
      seen.add(path);
      const d = gateDecision({ kind: 'post', baseIndex: true, chars: body.length, claimsText: `${p.title ?? ''} ${body}`, gate: GATE });
      postPages.push({ path, post: p, author, body, ok: d.index, at: p.createdAt ?? p.updatedAt ?? '' });
    }
    postPages.sort(newestFirst);
  }
  const postsOf = (a) => postPages.filter((x) => x.ok && x.author === a);

  // Legal questions: only reviewed answers of listed attorneys.
  const qaPages = [];
  if (PAGES_QA) {
    const seen = new Set();
    for (const q of opts.questions ?? []) {
      const answers = (q.answers ?? [])
        .filter((x) => x.reviewed === true && String(x.body ?? '').trim() && x.seoOptIn !== false)
        .map((x) => ({ ...x, author: listed.get(String(x.attorneyUsername ?? '').toLowerCase()) }))
        .filter((x) => x.author);
      if (!plain(q.title) || q.seoOptIn === false) { skip('qa-not-public'); continue; }
      if (!answers.length) { skip('qa-no-reviewed-answer'); continue; }
      if (hasContactInfo([q.title, q.body, ...answers.map((x) => x.body)].join('\n'))) { skip('qa-contact-info'); continue; }
      const path = `/legal-questions/${slugWithId(q.title, q.id, 'question')}/`;
      if (seen.has(path)) continue;
      seen.add(path);
      const chars = Math.max(...answers.map((x) => String(x.body).trim().length));
      const d = gateDecision({ kind: 'qa', baseIndex: true, chars, claimsText: [q.title, ...answers.map((x) => x.body)].join(' '), gate: GATE });
      qaPages.push({ path, q, answers, ok: d.index, at: q.updatedAt ?? q.createdAt ?? '' });
    }
    qaPages.sort(newestFirst);
  }
  const qaOk = qaPages.filter((x) => x.ok);
  const qaHubPath = '/legal-questions/';
  const qaOfPractice = (p) => qaOk.filter((x) => practiceOf(x.q.practiceCode)?.slug === p.slug).slice(0, 5);

  // City hubs: practice x city, only where enough listed attorneys practise there.
  const cities = [];
  if (PAGES_CITIES) {
    const minCity = Math.max(1, Number(GATE.minCityAttorneys) || defaultGate.minCityAttorneys);
    const groups = new Map();
    for (const a of attorneys) {
      if (!publicOk(a) || !a.city || !a.cityState) continue;
      const st = stateBy[String(a.cityState).toUpperCase()];
      if (!st || !a.licensedStates.includes(st.code)) continue; // the city must be in a state the attorney is licensed in
      const name = plain(a.city);
      const slug = slugify(name);
      if (!slug || PRACTICES.some((p) => p.slug === slug)) continue; // /lawyers/<state>/<x>/ is a practice page
      const key = `${st.code}|${slug}`;
      if (!groups.has(key)) groups.set(key, { state: st, name, slug, attorneys: [], byPractice: new Map() });
      const g = groups.get(key);
      g.attorneys.push(a);
      for (const p of PRACTICES) if (matches(a, p)) g.byPractice.set(p.slug, [...(g.byPractice.get(p.slug) ?? []), a]);
    }
    for (const g of [...groups.values()].sort((x, y) => (x.state.code + x.slug < y.state.code + y.slug ? -1 : 1))) {
      g.path = `/lawyers/${g.state.slug}/${g.slug}/`;
      g.hubs = PRACTICES.filter((p) => (g.byPractice.get(p.slug)?.length ?? 0) >= minCity).map((p) => ({ p, list: g.byPractice.get(p.slug), path: `${g.path}${p.slug}/` }));
      if (g.hubs.length) cities.push(g);
    }
  }
  const citiesOf = (st) => cities.filter((g) => g.state.code === st.code);
  const hubLinks = (list) => `<ul class="cols">${list.join('')}</ul>`;

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
<h2>By practice area</h2><ul class="cols">${PRACTICES.map((p) => `<li><a href="/practice-areas/${p.slug}/">${esc(p.name)}</a></li>`).join('')}</ul>${qaOk.length ? `<h2>Legal questions</h2><p><a href="${qaHubPath}">Questions answered by verified attorneys</a></p>` : ''}`,
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
<h2>Questions people ask</h2>${faqHtml(p.faq)}${qaOfPractice(p).length ? `<h2>Recent legal questions</h2><ul>${qaOfPractice(p).map((x) => `<li><a href="${x.path}">${esc(plain(x.q.title))}</a></li>`).join('')}</ul>` : ''}`,
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
<h2>Practice areas</h2><ul class="cols">${PRACTICES.map((p) => `<li><a href="/lawyers/${s.slug}/${p.slug}/">${esc(p.name)} lawyers</a></li>`).join('')}</ul>${citiesOf(s).length ? `<h2>Cities in ${esc(s.name)}</h2>${hubLinks(citiesOf(s).map((g) => `<li><a href="${g.path}">${esc(g.name)}</a></li>`))}` : ''}
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
<h2>More legal help in ${esc(s.name)}</h2><ul class="cols">${others.map((o) => `<li><a href="/lawyers/${s.slug}/${o.slug}/">${esc(o.name)}</a></li>`).join('')}<li><a href="${spath}">All practice areas in ${esc(s.name)}</a></li><li><a href="/practice-areas/${p.slug}/">${esc(p.name)} in every state</a></li></ul>${citiesOf(s).some((g) => g.hubs.some((h) => h.p.slug === p.slug)) ? `<h2>${esc(p.name)} lawyers by city in ${esc(s.name)}</h2>${hubLinks(citiesOf(s).filter((g) => g.hubs.some((h) => h.p.slug === p.slug)).map((g) => `<li><a href="${g.path}${p.slug}/">${esc(g.name)}</a></li>`))}` : ''}`,
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
<p><a href="${APP}/lawyer/${esc(a.username)}">Open the full profile in the LawBid app</a></p>${postsOf(a).length ? `<h2>Recent posts</h2><ul>${postsOf(a).slice(0, 5).map((x) => `<li><a href="${x.path}">${esc(plain(x.post.title) || clip(plain(x.body), 80))}</a></li>`).join('')}</ul>` : ''}`,
    }), { priority: '0.6', bio: a.bio, claimsText: [a.bio, a.displayName, ...a.firmNames].join(' '), updatedAt: a.updatedAt ?? a.updated_at });
  }

  // City pages: /lawyers/<state>/<city>/ and /lawyers/<state>/<city>/<practice>/.
  for (const g of cities) {
    const st = g.state;
    const spath = `/lawyers/${st.slug}/`;
    const where = `${g.name}, ${st.code}`;
    put(g.path, 'hub', (robots) => layout({ robots,
      title: `Lawyers in ${where} by practice area | LawBid`,
      description: `Find a licensed attorney in ${g.name}, ${st.name}. ${g.attorneys.length} verified attorney${g.attorneys.length === 1 ? '' : 's'} listed across ${g.hubs.length} practice area${g.hubs.length === 1 ? '' : 's'}.`,
      path: g.path,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: st.name, path: spath }, { name: g.name, path: g.path }],
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Lawyers in ${where}`, url: `${SITE}${g.path}`,
        areaServed: { '@type': 'City', name: g.name, containedInPlace: { '@type': 'State', name: st.name } },
        mainEntity: { '@type': 'ItemList', numberOfItems: g.hubs.length, itemListElement: g.hubs.map((h, i) => ({ '@type': 'ListItem', position: i + 1, name: `${h.p.name} lawyers in ${where}`, url: `${SITE}${h.path}` })) },
      }],
      body: `<h1>Lawyers in ${esc(g.name)}, ${esc(st.name)}</h1>
<p class="lead">Pick the kind of legal help you need in ${esc(g.name)}.</p>
${adBox(g.attorneys)}
${cta('Post your case — free')}
<h2>Practice areas in ${esc(g.name)}</h2>${hubLinks(g.hubs.map((h) => `<li><a href="${h.path}">${esc(h.p.name)} lawyers</a> (${h.list.length})</li>`))}
<h2>Verified attorneys in ${esc(g.name)}</h2>${g.attorneys.slice(0, 12).map(attorneyCard).join('')}
<p><a href="${spath}">All of ${esc(st.name)}</a></p>`,
    }), { priority: '0.6', type: 'cities', label: where, updatedAt: newest(g.attorneys.slice(0, 12)) });

    for (const h of g.hubs) {
      const { p, list } = h;
      const others = g.hubs.filter((o) => o.p.slug !== p.slug);
      put(h.path, 'city', (robots) => layout({ robots,
        title: `${p.name} lawyers in ${where} | LawBid`,
        description: `${list.length} verified ${p.name.toLowerCase()} attorneys in ${g.name}, ${st.name} on LawBid. Post your matter and licensed attorneys can respond with offers.`,
        path: h.path,
        crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: st.name, path: spath }, { name: g.name, path: g.path }, { name: p.name, path: h.path }],
        jsonld: [{
          '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${p.name} lawyers in ${where}`, url: `${SITE}${h.path}`, about: p.name,
          areaServed: { '@type': 'City', name: g.name, containedInPlace: { '@type': 'State', name: st.name } },
          mainEntity: {
            '@type': 'ItemList', numberOfItems: list.length,
            itemListElement: list.slice(0, 20).map((a, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Attorney', name: a.displayName, url: `${SITE}${profilePath(a)}` } })),
          },
        }, faqLd(p.faq)],
        body: `<h1>${esc(p.name)} lawyers in ${esc(g.name)}, ${esc(st.name)}</h1>
<p class="lead">${esc(p.intro)}</p>
${adBox(list.slice(0, 20))}
<h2>Verified ${esc(p.name.toLowerCase())} attorneys in ${esc(g.name)}</h2>${list.slice(0, 20).map(attorneyCard).join('')}${cta('Post your case — free')}
<h2>Common situations</h2><ul>${p.situations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<h2>How it works</h2><ol><li>Describe your matter and choose ${esc(st.name)}.</li><li>Licensed attorneys respond with offers.</li><li>You compare them and choose who to talk to.</li></ol>
<h2>Questions people ask</h2>${faqHtml(p.faq)}
<h2>More in ${esc(g.name)}</h2>${hubLinks([...others.slice(0, 6).map((o) => `<li><a href="${o.path}">${esc(o.p.name)} lawyers</a></li>`), `<li><a href="${g.path}">All practice areas in ${esc(g.name)}</a></li>`, `<li><a href="${spath}${p.slug}/">${esc(p.name)} lawyers in ${esc(st.name)}</a></li>`, `<li><a href="/practice-areas/${p.slug}/">${esc(p.name)} in every state</a></li>`])}`,
      }), { priority: '0.7', type: 'cities', attorneyCount: list.length, updatedAt: newest(list.slice(0, 20)) });
    }
  }

  // Attorney posts: /attorneys/<username>/posts/<slug>/ (text only).
  for (const x of postPages) {
    const { post, author: a, body, path } = x;
    const states = a.licensedStates.map((c) => stateBy[c]?.name ?? c);
    const headline = plain(post.title) || clip(plain(body).split(/(?<=[.!?])\s/)[0], 90);
    const topic = practiceOf(post.practiceCode);
    const published = dayOf(post.createdAt, BUILD_DATE);
    const modified = isoOrNull(post.editedAt ?? post.updatedAt ?? post.createdAt);
    put(path, 'post', (robots) => layout({ robots, ogType: 'article',
      title: `${clip(headline, 80)} | ${a.displayName} | LawBid`,
      description: clip(plain(body), 155),
      path,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: a.displayName, path: profilePath(a) }, { name: clip(headline, 60), path }],
      image: absoluteImage(a.photoUrl),
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'Article', headline: clip(headline, 110), url: `${SITE}${path}`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${path}` },
        ...(isoOrNull(post.createdAt) ? { datePublished: isoOrNull(post.createdAt) } : {}),
        ...(modified ? { dateModified: modified } : {}),
        ...(post.language ? { inLanguage: post.language } : {}),
        ...(topic ? { articleSection: topic.name } : {}),
        author: { '@type': 'Person', name: a.displayName, url: `${SITE}${profilePath(a)}`, jobTitle: 'Attorney' },
        publisher: { '@type': 'Organization', name: 'LawBid', url: SITE },
        ...(absoluteImage(a.photoUrl) !== BRAND_IMAGE ? { image: absoluteImage(a.photoUrl) } : {}),
      }],
      body: `<h1>${esc(headline)}</h1>
<p class="lead">By <a href="${profilePath(a)}">${esc(a.displayName)}</a>${states.length ? `, attorney licensed in ${esc(states.join(', '))}` : ''}${published ? ` · <time datetime="${published}">${published}</time>` : ''}</p>
${adBox([a])}
${paragraphs(body)}
${topic ? `<p><strong>Topic:</strong> <a href="/practice-areas/${topic.slug}/">${esc(topic.name)}</a></p>` : ''}
${NOT_ADVICE}
${cta('Post your case — free')}
<p><a href="${profilePath(a)}">More about ${esc(a.displayName)}</a></p>`,
    }), { priority: '0.4', chars: body.length, claimsText: `${post.title ?? ''} ${body}`, updatedAt: post.editedAt ?? post.updatedAt ?? post.createdAt });
  }

  // Legal questions: /legal-questions/<slug>/ and the hub (reviewed answers only).
  for (const x of qaPages) {
    const { q, answers, path } = x;
    const st = q.stateCode ? stateBy[String(q.stateCode).toUpperCase()] : undefined;
    const pr = practiceOf(q.practiceCode);
    const title = plain(q.title);
    const first = answers[0];
    const asked = dayOf(q.createdAt, BUILD_DATE);
    put(path, 'qa', (robots) => layout({ robots,
      title: `${clip(title, 90)} | Legal questions | LawBid`,
      description: clip(plain(first.body), 155),
      path,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: 'Legal questions', path: qaHubPath }, { name: clip(title, 60), path }],
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: [{
          '@type': 'Question', name: title, ...(isoOrNull(q.createdAt) ? { dateCreated: isoOrNull(q.createdAt) } : {}),
          acceptedAnswer: { '@type': 'Answer', text: plain(first.body), author: { '@type': 'Person', name: first.author.displayName, url: `${SITE}${profilePath(first.author)}`, jobTitle: 'Attorney' }, ...(isoOrNull(first.createdAt) ? { dateCreated: isoOrNull(first.createdAt) } : {}) },
        }],
      }],
      body: `<h1>${esc(title)}</h1>
<p class="lead">A question${st ? ` about ${esc(st.name)}` : ''}${pr ? ` (${esc(pr.name)})` : ''}${asked ? `, asked ${asked}` : ''}. The answer below is from a verified attorney.</p>
${adBox(answers.map((y) => y.author))}
<h2>The question</h2>
${paragraphs(q.body ?? '')}
<h2>Answer${answers.length === 1 ? '' : 's'} from verified attorney${answers.length === 1 ? '' : 's'}</h2>
${answers.map((y) => `<div class="box">${paragraphs(y.body)}<p><small>Answered by <a href="${profilePath(y.author)}">${esc(y.author.displayName)}</a>${y.author.licensedStates.length ? `, licensed in ${esc(y.author.licensedStates.map((c) => stateBy[c]?.name ?? c).join(', '))}` : ''}.</small></p></div>`).join('\n')}
${NOT_ADVICE}
${cta('Post your own legal matter — free')}
<h2>Related</h2><ul>${[
        pr ? `<li><a href="/practice-areas/${pr.slug}/">${esc(pr.name)} lawyers: how it works</a></li>` : '',
        st && pr ? `<li><a href="/lawyers/${st.slug}/${pr.slug}/">${esc(pr.name)} lawyers in ${esc(st.name)}</a></li>` : '',
        st ? `<li><a href="/lawyers/${st.slug}/">Lawyers in ${esc(st.name)}</a></li>` : '',
        `<li><a href="${qaHubPath}">More legal questions</a></li>`,
      ].filter(Boolean).join('')}</ul>`,
    }), { priority: '0.5', chars: Math.max(...answers.map((y) => String(y.body).trim().length)), claimsText: [q.title, ...answers.map((y) => y.body)].join(' '), updatedAt: q.updatedAt ?? q.createdAt });
  }
  if (qaOk.length) {
    put(qaHubPath, 'hub', (robots) => layout({ robots,
      title: 'Legal questions answered by verified attorneys | LawBid',
      description: 'Questions people asked about their legal matter and the answers verified attorneys gave. General information, not legal advice.',
      path: qaHubPath,
      crumbs: [{ name: 'Lawyers', path: '/lawyers/' }, { name: 'Legal questions', path: qaHubPath }],
      jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Legal questions', url: `${SITE}${qaHubPath}`, mainEntity: { '@type': 'ItemList', numberOfItems: Math.min(qaOk.length, 200), itemListElement: qaOk.slice(0, 200).map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${x.path}`, name: plain(x.q.title) })) } }],
      body: `<h1>Legal questions</h1>
<p class="lead">Questions people asked and the answers verified attorneys gave.</p>
${NOT_ADVICE}
<ul>${qaOk.slice(0, 200).map((x) => `<li><a href="${x.path}">${esc(plain(x.q.title))}</a></li>`).join('')}</ul>
${cta('Post your own legal matter — free')}`,
    }), { priority: '0.6', type: 'legal-questions', updatedAt: qaOk[0]?.q.updatedAt ?? qaOk[0]?.q.createdAt });
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
      chars: e.chars ?? 0,
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
    if (e.indexed) sitemapEntries.push({ path: e.path, lastmod, priority: e.priority ?? '0.5', ...(e.type ? { type: e.type } : {}) });
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
    const listedPaths = new Set(sitemapEntries.map((x) => x.path));
    const practices = PRACTICES.filter((p) => listedPaths.has(`/practice-areas/${p.slug}/`));
    const states = stateList.filter((st) => listedPaths.has(`/lawyers/${st.slug}/`));
    const cityList = entries.filter((e) => e.type === 'cities' && e.kind === 'hub' && listedPaths.has(e.path)).map((e) => ({ name: e.label, path: e.path }));
    const questionCount = qaPages.filter((x) => listedPaths.has(x.path)).length;
    discovery.set('llms.txt', llmsTxt({ site: SITE, practices, states, attorneyCount: attorneys.length, cities: cityList, questionCount }));
    discovery.set('llms-full.txt', llmsFullTxt({ site: SITE, practices }));
  }
  if (MANIFEST) {
    const m = { version: 1, builtAt: BUILD_DATE, pages: map };
    if (RAMP > 0) m.ramp = { perDay: RAMP, date: BUILD_DATE, deferred: ramp.deferred.length };
    discovery.set(MANIFEST_NAME, JSON.stringify(m));
  }

  return {
    files,
    discovery,
    result: {
      pages: files.size,
      indexed: sitemapEntries.length,
      attorneys: attorneys.length,
      noindex,
      sitemapFiles: useIndex ? [...discovery.keys()].filter((k) => k.startsWith('sitemaps/')).length : 1,
      discovery: [...discovery.keys()],
      rampDeferred: ramp ? ramp.deferred.length : 0,
      // Page types of 2026-10-27 (0 while their switches are off); `skipped`
      // counts rows left out (no listed author, media, contact data ...), never their text.
      postPages: postPages.length,
      cityPages: entries.filter((e) => e.type === 'cities').length,
      questionPages: qaPages.length,
      skipped,
    },
  };
}
