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
// The page rendering itself is lib/render.mjs (shared with the API's `seo.generate`
// job, which does the same from the database instead of from this script).
// Always on: no aggregateRating in the attorney JSON-LD; lastmod is the
// entity's updatedAt when the data has it, else the day the page's content
// last changed (from the previous manifest), else the build day.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampMax, defaultGate, renderSite } from './lib/render.mjs';

export { dayOf, esc, slugify } from './lib/render.mjs';

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
const DRY = flag('dry-run');
const PREV_FILE = arg('prev-manifest', process.env.SEO_PREV_MANIFEST ?? '');

// S20-2 (2026-10-25): 100 attorneys per page. The old fixed cap of 500 pages
// (50 000 attorneys) cut the list off without a word; now the cap is a
// setting (--max-pages / repository variable SEO_MAX_PAGES) and reaching it
// with more data still waiting FAILS the build loudly instead of publishing
// a truncated directory.
const MAX_PAGES = Math.max(1, Number(arg('max-pages', '2000')) || 2000);

export async function fetchAllAttorneys({ api, fetchFn = fetch, maxPages = MAX_PAGES }) {
  const all = [];
  let cursor = '';
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchFn(`${api}/public/directory/attorneys?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!res.ok) throw new Error(`directory ${res.status}`);
    const body = await res.json();
    all.push(...body.data);
    cursor = body.meta?.nextCursor ?? '';
    if (!cursor) return all;
  }
  throw new Error(
    `directory has more than ${maxPages * 100} attorneys: raise SEO_MAX_PAGES (now ${maxPages}); nothing was published`,
  );
}

async function loadAttorneys() {
  if (OFFLINE) return JSON.parse(await readFile(OFFLINE, 'utf8')).attorneys;
  if (!API) throw new Error('--api or --offline is required');
  return fetchAllAttorneys({ api: API });
}

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
  const ramp = num('ramp-per-day', 'SEO_RAMP_PER_DAY', 0);
  const { files, discovery, result } = renderSite(attorneys, {
    site: SITE,
    buildDate: arg('date', new Date().toISOString().slice(0, 10)),
    indexEmpty: flag('index-empty'),
    sitemapIndex: on('sitemap-index', 'SEO_SITEMAP_INDEX'),
    robotsAi: on('robots-ai', 'SEO_ROBOTS_AI'),
    allowTraining: (process.env.SEO_AI_TRAINING ?? '') === 'allow',
    llms: on('llms', 'SEO_LLMS'),
    rampPerDay: ramp,
    rampBaseline: arg('ramp-baseline', process.env.SEO_RAMP_BASELINE ?? 'all'),
    manifest: on('manifest', 'SEO_INCREMENTAL'),
    gate: {
      enabled: on('quality-gate', 'SEO_QUALITY_GATE'),
      minWords: num('min-words', 'SEO_MIN_WORDS', defaultGate.minWords),
      minAttorneys: num('min-attorneys', 'SEO_MIN_ATTORNEYS', defaultGate.minAttorneys),
      minBioChars: num('min-bio-chars', 'SEO_MIN_BIO_CHARS', defaultGate.minBioChars),
    },
    sitemapMax: clampMax(arg('sitemap-max', process.env.SEO_SITEMAP_MAX)),
    prev,
  });
  if (DRY) return { ...result, dryRun: true };

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
  return { ...result, dryRun: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  console.log(`seo${r.dryRun ? ' (dry run, nothing written)' : ''}: ${r.pages} pages (${r.indexed} indexed in the sitemap), ${r.attorneys} attorneys → ${OUT}`);
  if (r.dryRun) console.log(JSON.stringify({ noindex: r.noindex, rampDeferred: r.rampDeferred, sitemapFiles: r.sitemapFiles, files: r.discovery }, null, 2));
}
