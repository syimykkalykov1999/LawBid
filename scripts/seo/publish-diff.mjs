#!/usr/bin/env node
// S20-2 (2026-10-25): publish only what changed. The daily SEO build used
// to re-upload every page (new file times) and wipe the whole CDN cache
// with "/*" — which also evicted the Flutter app files. Now:
//   1. every built file gets a sha256 in seo-manifest.json (published next
//      to the pages; its name is in public-paths.txt so web-deploy keeps it);
//   2. the previous manifest is read from the bucket; only new / changed
//      files are uploaded, vanished ones are deleted;
//   3. only the changed page addresses are invalidated (never "/*"; the
//      pages already carry max-age=3600, so an invalidation only speeds up
//      what an hour would do anyway).
//
// Usage: node scripts/seo/publish-diff.mjs --dir dist-seo --prev prev.json \
//          [--max-paths 50] [--force]
// Writes (inside --dir's parent, named by --out, default "."): changed.txt,
// deleted.txt, invalidate.txt. Prints a one-line summary.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix, sep } from 'node:path';

export const MANIFEST = 'seo-manifest.json';

export async function hashDir(dir, rel = '') {
  const out = {};
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? posix.join(rel, e.name) : e.name;
    if (e.isDirectory()) Object.assign(out, await hashDir(dir, r));
    else if (r !== MANIFEST) {
      out[r.split(sep).join('/')] = createHash('sha256')
        .update(await readFile(join(dir, r)))
        .digest('hex');
    }
  }
  return out;
}

/** New or changed files, and files that no longer exist. */
export function diffManifests(prev, next, force = false) {
  const changed = Object.keys(next).filter((f) => force || prev[f] !== next[f]).sort();
  const deleted = Object.keys(prev).filter((f) => !(f in next)).sort();
  return { changed, deleted };
}

/** The address(es) a file is served on. */
function addressesOf(file) {
  if (file.endsWith('/index.html')) {
    const dir = file.slice(0, -'index.html'.length);
    return [`/${dir}`];
  }
  return [`/${file}`];
}

/**
 * CDN paths to invalidate for a change set. Hashed build assets under
 * `_next/` never need it (new name = new file). More than [maxPaths] page
 * addresses are collapsed into one wildcard per first-level folder
 * ("/attorneys/*") — a wildcard is one path — and NEVER a root "/*".
 */
export function invalidationPaths(changed, deleted, maxPaths = 50) {
  const files = [...changed, ...deleted].filter((f) => !f.startsWith('_next/'));
  const paths = [...new Set(files.flatMap(addressesOf))].sort();
  if (paths.length <= maxPaths) return paths;
  const folders = new Set();
  const loose = [];
  for (const p of paths) {
    const seg = p.split('/')[1];
    if (p.split('/').length > 2 && seg) folders.add(`/${seg}/*`);
    else loose.push(p);
  }
  return [...new Set([...loose, ...folders])].sort();
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const dir = arg('dir');
  const prevFile = arg('prev');
  if (!dir || !prevFile) {
    console.error('usage: publish-diff.mjs --dir <dir> --prev <prev-manifest.json> [--max-paths 50] [--force]');
    process.exit(2);
  }
  const maxPaths = Number(arg('max-paths', '50')) || 50;
  const force = argv.includes('--force');
  let prev = {};
  try {
    prev = JSON.parse(await readFile(prevFile, 'utf8'));
  } catch {
    // first run, or an unreadable manifest: everything is "new"
  }
  // The manifest must be kept by web-deploy.yml, so list it in public-paths.txt
  // BEFORE hashing (public-paths.txt is part of the manifest).
  const pp = join(dir, 'public-paths.txt');
  try {
    const lines = (await readFile(pp, 'utf8')).split('\n').filter(Boolean);
    if (!lines.includes(MANIFEST)) {
      lines.push(MANIFEST);
      await writeFile(pp, `${lines.sort().join('\n')}\n`);
    }
  } catch {
    // no public-paths.txt (a bare build): nothing to extend
  }
  const next = await hashDir(dir);
  const { changed, deleted } = diffManifests(prev, next, force);
  const paths = invalidationPaths(changed, deleted, maxPaths);
  await writeFile(join(dir, MANIFEST), `${JSON.stringify(next)}\n`);
  const out = arg('out', '.');
  await writeFile(join(out, 'changed.txt'), changed.map((f) => `${f}\n`).join(''));
  await writeFile(join(out, 'deleted.txt'), deleted.map((f) => `${f}\n`).join(''));
  await writeFile(join(out, 'invalidate.txt'), paths.map((f) => `${f}\n`).join(''));
  console.log(
    `seo publish: ${changed.length} changed/new, ${deleted.length} removed, ${paths.length} CDN path(s), ${Object.keys(next).length} files total`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('publish-diff.mjs')) await main();
