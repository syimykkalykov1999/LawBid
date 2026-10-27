// Discovery files of the static public pages: sitemap index + per-type
// sitemaps, robots.txt, llms.txt, llms-full.txt. Pure functions (strings in,
// strings out): the generator (build.mjs) and the tests call them, nothing
// here touches the network, the API or the database. Plan:
// docs/architecture/PSEO_ASO_PACKAGE_PLAN_2026-10-27.md §2.5-2.7.

export const SITEMAP_HARD_LIMIT = 50000; // sitemaps.org: 50 000 URLs / 50 MB per file
export const SITEMAP_DEFAULT_MAX = 10000; // the plan's margin below the limit

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Which per-type sitemap a page path belongs to. */
export function sitemapType(path) {
  if (/^\/attorneys\/[^/]+\/posts\//.test(path)) return 'posts';
  if (path.startsWith('/legal-questions')) return 'legal-questions';
  if (path.startsWith('/attorneys/')) return 'attorneys';
  if (path.startsWith('/practice-areas/')) return 'practice-areas';
  if (path.startsWith('/lawyers')) return 'lawyers';
  return 'site';
}

export const clampMax = (n) => {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v) || v < 1) return SITEMAP_DEFAULT_MAX;
  return Math.min(v, SITEMAP_HARD_LIMIT);
};

const urlsetOpen = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

/** One `<url>` element. `priority` is only written when given (legacy mode). */
export const urlElement = (site, e) =>
  `<url><loc>${esc(site + e.path)}</loc>${e.lastmod ? `<lastmod>${esc(e.lastmod)}</lastmod>` : ''}${e.priority ? `<priority>${esc(e.priority)}</priority>` : ''}</url>`;

export const urlset = (site, entries) => `${urlsetOpen}${entries.map((e) => urlElement(site, e)).join('\n')}\n</urlset>\n`;

const maxDate = (entries) => entries.reduce((m, e) => (e.lastmod && e.lastmod > m ? e.lastmod : m), '');

/**
 * Sitemap index + per-type files, at most `max` (<= 50 000) URLs per file.
 * entries: [{ path, lastmod, priority?, type? }], indexable pages only. `type`
 * overrides the type derived from the path (city hubs live under /lawyers/ but
 * get their own `cities-<n>.xml`).
 * Returns { index: xml, files: Map<'sitemaps/<type>-<n>.xml', xml> }.
 */
export function sitemapIndex({ site, entries, max = SITEMAP_DEFAULT_MAX }) {
  const limit = clampMax(max);
  const byType = new Map();
  for (const e of [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const t = e.type ?? sitemapType(e.path);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push({ path: e.path, lastmod: e.lastmod, priority: undefined });
  }
  const files = new Map();
  const refs = [];
  for (const type of [...byType.keys()].sort()) {
    const list = byType.get(type);
    for (let i = 0, n = 1; i < list.length; i += limit, n++) {
      const part = list.slice(i, i + limit);
      const name = `sitemaps/${type}-${n}.xml`;
      files.set(name, urlset(site, part));
      refs.push({ name, lastmod: maxDate(part) });
    }
  }
  return { index: sitemapIndexXml(site, refs), files };
}

/** `<sitemapindex>` for already-named child files: [{ name, lastmod }]. */
export function sitemapIndexXml(site, refs) {
  if (refs.length === 0) return `${urlsetOpen}</urlset>\n`; // an empty index is not valid
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${refs
    .map((r) => `<sitemap><loc>${esc(`${site}/${r.name}`)}</loc>${r.lastmod ? `<lastmod>${esc(r.lastmod)}</lastmod>` : ''}</sitemap>`)
    .join('\n')}\n</sitemapindex>\n`;
}

// Search and "on behalf of a user" crawlers: allowed. They decide whether
// the pages show up in Google/Bing/ChatGPT search/Claude/Perplexity answers.
export const SEARCH_BOTS = [
  'Googlebot',
  'Bingbot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
];
// Model-training crawlers: refused by default (owner policy: search yes,
// training no). Google-Extended does not affect Google Search.
export const TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'CCBot', 'Applebot-Extended', 'Meta-ExternalAgent'];

// Never crawled: the API, sign-in and QR links, shared/private links, the
// internal paths and tracking-parameter duplicates. noindex pages are NOT
// listed: a robots block would hide the noindex mark from the crawler.
export const ROBOTS_DISALLOW = ['/api/', '/auth/', '/qr/', '/q/', '/g/', '/r/', '/internal/', '/*?utm_', '/seo-manifest.json'];

/**
 * robots.txt. Without `ai` the file is the legacy one (allow everything).
 * With `ai`: search bots in, training bots out (unless allowTraining).
 */
export function robotsTxt({ site, ai = false, allowTraining = false }) {
  if (!ai) return `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`;
  const rules = `Allow: /\n${ROBOTS_DISALLOW.map((d) => `Disallow: ${d}`).join('\n')}\n`;
  const group = (agents, body) => `${agents.map((a) => `User-agent: ${a}`).join('\n')}\n${body}\n`;
  const parts = [
    '# LawBid public pages. Search and answer-engine crawlers are welcome; model-training crawlers are not.\n',
    group(['*'], rules),
    group(SEARCH_BOTS, rules),
  ];
  if (!allowTraining) parts.push(group(TRAINING_BOTS, 'Disallow: /\n'));
  parts.push(`Sitemap: ${site}/sitemap.xml\n`);
  return parts.join('\n');
}

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const LLMS_DISCLAIMER =
  'LawBid is a marketplace where people post their legal matter and attorneys licensed in their state respond. LawBid is not a law firm, does not give legal advice and does not guarantee any result.';

/**
 * /llms.txt: short, factual index of the public hubs. No attorney names or
 * any other personal data; only counts. practices/states: [{ slug, name }]
 * that are indexable in this snapshot. cities: [{ name, path }] (indexable city
 * pages); questionCount: indexable /legal-questions/ pages. Both sections are
 * left out when empty, so the file is unchanged while those page types are off.
 */
export function llmsTxt({ site, practices, states, attorneyCount, cities = [], questionCount = 0 }) {
  const lines = [
    '# LawBid',
    '',
    `> ${LLMS_DISCLAIMER}`,
    '',
    `Public directory: ${attorneyCount} verified attorney profile${attorneyCount === 1 ? '' : 's'} (public profile facts only; no case or client data).`,
    '',
    '## Directory',
    `- [Find a lawyer](${site}/lawyers/): all states and practice areas`,
    '',
    '## Practice areas',
    ...practices.map((p) => `- [${oneLine(p.name)}](${site}/practice-areas/${p.slug}/)`),
    '',
    '## States',
    ...states.map((s) => `- [Lawyers in ${oneLine(s.name)}](${site}/lawyers/${s.slug}/)`),
    '',
    ...(cities.length ? ['## Cities', ...cities.map((c) => `- [Lawyers in ${oneLine(c.name)}](${site}${c.path})`), ''] : []),
    ...(questionCount > 0
      ? ['## Legal questions', `- [Legal questions answered by verified attorneys](${site}/legal-questions/): ${questionCount} question${questionCount === 1 ? '' : 's'}; general information, not legal advice`, '']
      : []),
    '## Optional',
    `- [Full text of the practice-area guides](${site}/llms-full.txt)`,
    '',
    '## Citing',
    'Cite the page URL. General information only; it is not legal advice.',
    '',
  ];
  return lines.join('\n');
}

/** /llms-full.txt: the public practice-area guides (no attorneys, no posts). */
export function llmsFullTxt({ site, practices }) {
  const out = ['# LawBid practice-area guides', '', `> ${LLMS_DISCLAIMER}`, ''];
  for (const p of practices) {
    out.push(`## ${oneLine(p.name)}`, `URL: ${site}/practice-areas/${p.slug}/`, '', oneLine(p.intro), '');
    if (p.situations?.length) out.push('Common situations:', ...p.situations.map((s) => `- ${oneLine(s)}`), '');
    for (const [q, a] of p.faq ?? []) out.push(`Q: ${oneLine(q)}`, `A: ${oneLine(a)}`, '');
  }
  return out.join('\n');
}
