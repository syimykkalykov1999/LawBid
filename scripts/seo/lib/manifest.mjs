// Content-hash manifest of the published files: only changed files are
// uploaded and only changed paths are sent to CloudFront for a reset
// (plan §2.2, §2.4). Pure planning functions plus a directory hasher; the
// workflow (seo-deploy.yml) does the AWS calls from the plan.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export const MANIFEST_NAME = 'seo-manifest.json';
export const DEFAULT_MAX_INVALIDATIONS = 30; // per day; the free tier is 1 000 a month

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** { 'relative/posix/path': sha256 } for every file under dir (except the manifest itself). */
export async function hashDir(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        const rel = relative(dir, p).split(sep).join('/');
        if (rel !== MANIFEST_NAME) out[rel] = sha256(await readFile(p));
      }
    }
  }
  await walk(dir);
  return out;
}

/** What to upload and what to remove, from two { path: hash } maps. */
export function planFiles({ files, prevFiles }) {
  const prev = prevFiles ?? {};
  const upload = [];
  const changed = []; // existed before with other content
  for (const [p, h] of Object.entries(files)) {
    if (prev[p] !== h) {
      upload.push(p);
      if (p in prev) changed.push(p);
    }
  }
  // `_next/` is content-hashed and immutable: an old page in a CDN cache may
  // still point at an old chunk, so it is never removed here.
  const remove = Object.keys(prev).filter((p) => !(p in files) && !p.startsWith('_next/'));
  return { upload: upload.sort(), changed: changed.sort(), remove: remove.sort(), unchanged: Object.keys(files).length - upload.length };
}

/** Viewer URLs a file is served at ('x/index.html' is /x/; the CDN keys on both forms). */
export function urlsForFile(rel) {
  if (rel.startsWith('_next/')) return [];
  if (rel.endsWith('/index.html')) {
    const dir = `/${rel.slice(0, -'index.html'.length)}`;
    return [dir, `${dir}index.html`];
  }
  if (rel === 'index.html') return []; // the app owns the root
  return [`/${rel}`];
}

const tier = (rel, removed) => {
  if (removed) return 0; // a page that is gone must disappear first
  if (rel === 'robots.txt') return 1;
  if (rel === 'sitemap.xml') return 2;
  return 3;
};

/** Never the whole distribution, never the app's own paths. */
export function isSafeInvalidationPath(p) {
  if (!p.startsWith('/') || p === '/' || p === '/*' || p === '/index.html') return false;
  if (/^\/(v|releases|icons|_next|assets|canvaskit)(\/|$)/.test(p)) return false;
  if (p.includes('*') && !p.endsWith('/*')) return false;
  return !/^\/\*/.test(p);
}

/**
 * Paths for create-invalidation. Pages new in this run need none (nothing
 * cached yet). Over the day's remaining budget: pages of the same first
 * folder collapse into one `/<folder>/*` wildcard (one path), then the rest
 * waits for the cache lifetime (max-age 3600). Returns { paths, skipped, used }.
 */
export function pickInvalidations({ changed, removed, max = DEFAULT_MAX_INVALIDATIONS, usedToday = 0 }) {
  const budget = Math.max(0, max - usedToday);
  const items = [];
  const seen = new Set();
  const add = (rel, isRemoved) => {
    for (const u of urlsForFile(rel)) {
      if (!isSafeInvalidationPath(u) || seen.has(u)) continue;
      seen.add(u);
      items.push({ url: u, rel, tier: tier(rel, isRemoved), folder: rel.includes('/') ? rel.split('/')[0] : '' });
    }
  };
  removed.forEach((r) => add(r, true));
  changed.forEach((r) => add(r, false));
  items.sort((a, b) => a.tier - b.tier || (a.url < b.url ? -1 : 1));

  let picked = items.map((i) => ({ url: i.url, tier: i.tier, n: 1 }));
  if (items.length > budget) {
    const groups = new Map();
    const loose = [];
    for (const it of items) {
      if (it.folder === '' || it.folder === '.well-known') loose.push(it);
      else groups.set(it.folder, [...(groups.get(it.folder) ?? []), it]);
    }
    const wild = [...groups.entries()]
      // folders with fewer than 2 paths keep their exact path
      .flatMap(([folder, list]) => (list.length > 1 ? [{ url: `/${folder}/*`, tier: Math.min(...list.map((l) => l.tier)), n: list.length }] : list.map((l) => ({ url: l.url, tier: l.tier, n: 1 }))));
    picked = [...loose.map((l) => ({ url: l.url, tier: l.tier, n: 1 })), ...wild].filter((it) => isSafeInvalidationPath(it.url));
    picked.sort((a, b) => a.tier - b.tier || a.url.localeCompare(b.url));
  }
  const take = picked.slice(0, budget);
  const covered = take.reduce((n, i) => n + i.n, 0);
  return { paths: take.map((i) => i.url), skipped: Math.max(0, items.length - covered), used: usedToday + take.length };
}

/** Batches for `aws s3api delete-objects` (1000 keys at most). */
export const deleteBatches = (keys, size = 1000) => {
  const out = [];
  for (let i = 0; i < keys.length; i += size) out.push({ Objects: keys.slice(i, i + size).map((Key) => ({ Key })), Quiet: true });
  return out;
};
