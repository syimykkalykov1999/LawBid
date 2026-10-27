#!/usr/bin/env node
// Owner 2026-10-16: the web app is on the domain root and the company site
// (repository LawBidSite, `npm run build:static` with TRAILING_SLASH=1) is
// served from the same bucket: its landing is /about, plus the legal
// pages, pricing, FAQ... This merges the site's export into the SEO pages
// (scripts/seo/build.mjs output) before both are published:
//
//   - the SEO pages win every clash (/lawyers, /attorneys/<name>,
//     /practice-areas/<practice>: built from live data);
//   - the site's home page, its 404 page and its own /lawyers pages are
//     left out (the root is the app);
//   - one sitemap.xml with both sets of addresses (when the SEO build wrote a
//     sitemap index, the site's addresses become one more child sitemap,
//     sitemaps/site-<n>.xml, with the same <= 50 000 limit) and one
//     robots.txt (the one the SEO build wrote, else a plain one);
//   - public-paths.txt: the first path segments that belong to the public
//     pages, read by web-deploy.yml so the app's upload never deletes them.
//
// Usage: node scripts/seo/merge-site.mjs --seo dist-seo --site out --site-url https://lawbid.dev
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SITEMAP_HARD_LIMIT, sitemapIndexXml, urlset } from './lib/discovery.mjs';

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const SKIP_TOP = new Set([
  'index.html',
  '404.html',
  '404',
  '_not-found',
  'index.txt',
  'lawyers',
  'sitemap.xml',
  'robots.txt',
  'CNAME',
]);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

export async function mergeSite({ seo, site, siteUrl }) {
  const base = siteUrl.replace(/\/$/, '');
  const copied = [];
  for (const name of await readdir(site)) {
    // __next.*.txt at the top are the site home's data (the home is skipped).
    if (SKIP_TOP.has(name) || name.startsWith('__next.')) continue;
    // force: false keeps the SEO page when both have the same file.
    await cp(join(site, name), join(seo, name), {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    copied.push(name);
  }

  const seoXml = (await exists(join(seo, 'sitemap.xml'))) ? await readFile(join(seo, 'sitemap.xml'), 'utf8') : '';
  const siteUrls = (await exists(join(site, 'sitemap.xml')))
    ? locs(await readFile(join(site, 'sitemap.xml'), 'utf8'))
    : [];
  const keepSite = siteUrls
    .map((u) => u.replace(/^https?:\/\/[^/]+/, base))
    .filter((u) => {
      const path = u.slice(base.length).replace(/\/$/, '');
      return path !== '' && !path.startsWith('/lawyers');
    });
  const siteAll = [...new Set([`${base}/`, ...keepSite])];
  let count;
  if (/<sitemapindex[\s>]/.test(seoXml)) {
    // Index mode: the site's addresses are one more child sitemap per 50 000.
    const refs = [...seoXml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)].map((m) => ({
      name: /<loc>([^<]+)<\/loc>/.exec(m[1])[1].trim().replace(/^https?:\/\/[^/]+\//, ''),
      lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1],
    }));
    count = siteAll.length;
    for (const r of refs) count += locs(await readFile(join(seo, r.name), 'utf8')).length;
    await mkdir(join(seo, 'sitemaps'), { recursive: true });
    for (let i = 0, n = 1; i < siteAll.length; i += SITEMAP_HARD_LIMIT, n++) {
      const name = `sitemaps/site-${n}.xml`;
      const part = siteAll.slice(i, i + SITEMAP_HARD_LIMIT).map((u) => ({ path: u.slice(base.length) || '/' }));
      await writeFile(join(seo, name), urlset(base, part));
      refs.push({ name });
    }
    await writeFile(join(seo, 'sitemap.xml'), sitemapIndexXml(base, refs));
  } else {
    // One file; the SEO pages keep their lastmod and priority.
    const seoBlocks = [...seoXml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
    const known = new Set(seoBlocks.map((b) => locs(b)[0]));
    const body = [
      ...(known.has(`${base}/`) ? [] : [`<url><loc>${base}/</loc></url>`]),
      ...seoBlocks,
      ...siteAll.filter((u) => !known.has(u) && u !== `${base}/`).map((u) => `<url><loc>${u}</loc></url>`),
    ];
    count = body.length;
    await writeFile(
      join(seo, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body.map((x) => `  ${x}`).join('\n')}\n</urlset>\n`,
    );
  }
  if (!(await exists(join(seo, 'robots.txt')))) {
    await writeFile(join(seo, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  }
  const top = (await readdir(seo)).filter((n) => n !== 'public-paths.txt');
  await writeFile(join(seo, 'public-paths.txt'), `${top.sort().join('\n')}\n`);
  return { copied, urls: count, top };
}

if (process.argv[1] && process.argv[1].endsWith('merge-site.mjs')) {
  const seo = arg('--seo');
  const site = arg('--site');
  const siteUrl = arg('--site-url');
  if (!seo || !site || !siteUrl) {
    console.error('usage: merge-site.mjs --seo <dir> --site <dir> --site-url <https://host>');
    process.exit(2);
  }
  const r = await mergeSite({ seo, site, siteUrl });
  console.log(
    `site: ${r.copied.length} entries merged, sitemap ${r.urls} addresses, public paths: ${r.top.join(' ')}`,
  );
}
