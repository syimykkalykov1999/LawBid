// R2 row 171 (detective 14.11): the published sitemap listed 21 company-site
// addresses without the trailing slash (/clients, /pricing ...) while every
// page's canonical is /clients/, and /clients answered 200 as a second copy.
// This builds the SEO pages from the fixture, merges a company-site export
// whose own sitemap has the slash-less form (the live LawBidSite list), then
// reads EVERY <loc> of the result (index and child sitemaps) and checks:
//   - each address is canonical: it ends in "/" or names a file;
//   - the edge (the seo_index CloudFront Function from main.tf, run in
//     node:vm) serves each address as is, never a 301 to another address;
//   - the edge function's code is not hidden from the Terraform apply, so
//     the 301 from /clients to /clients/ really reaches CloudFront.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { mergeSite } from '../merge-site.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://lawbid.dev';
const tf = readFileSync(join(here, '..', '..', '..', 'infra', 'modules', 'web', 'main.tf'), 'utf8');
const resource = /resource "aws_cloudfront_function" "seo_index" \{[\s\S]*?\n {2}EOT\n\}/.exec(tf)?.[0];
assert.ok(resource, 'seo_index resource not found in main.tf');

function edgeHandler() {
  const code = /code\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT\n/.exec(resource)[1];
  const source = code
    .replace("import cf from 'cloudfront';", '')
    .replace(/\$\{element\([^}]*\)\}/, 'store-id')
    .replace(/\$\$\{/g, '${');
  const cf = { kvs: () => ({ get: async () => Promise.reject(new Error('missing')) }) };
  return vm.runInNewContext(`${source}\n;handler`, { cf });
}

// The company-site sitemap as the live site emitted it before the fix
// (https://lawbid.dev/sitemaps/site-1.xml, 14.11): 21 pages without "/".
const LIVE_SITE_PATHS = [
  'clients', 'attorneys', 'features', 'practice-areas', 'pricing', 'faq', 'about', 'contact',
  'download', 'terms', 'privacy', 'delete-account', 'client-agreement', 'attorney-agreement',
  'eula', 'refunds', 'third-party-services', 'cookies', 'sms-consent', 'dmca', 'accessibility',
];

function put(root, path, body) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

const locsOf = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

// Every page address the published sitemap names, through the index.
function allSitemapUrls(out) {
  const top = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  if (!/<sitemapindex[\s>]/.test(top)) return locsOf(top);
  return locsOf(top).flatMap((child) => locsOf(readFileSync(join(out, child.slice(SITE.length + 1)), 'utf8')));
}

async function publish({ index }) {
  const out = mkdtempSync(join(tmpdir(), 'seo-canon-'));
  const site = mkdtempSync(join(tmpdir(), 'site-canon-'));
  execFileSync(
    'node',
    [join(here, '..', 'build.mjs'), '--offline', join(here, 'fixture.json'), '--site', SITE, '--out', out, '--date', '2026-10-15'],
    { stdio: 'pipe' },
  );
  if (index) {
    // Index mode (production size): the SEO pages sit in a child sitemap.
    const urls = readFileSync(join(out, 'sitemap.xml'), 'utf8');
    put(out, 'sitemaps/pages-1.xml', urls);
    put(
      out,
      'sitemap.xml',
      `<sitemapindex><sitemap><loc>${SITE}/sitemaps/pages-1.xml</loc></sitemap></sitemapindex>`,
    );
  }
  put(site, 'index.html', 'SITE HOME');
  for (const p of LIVE_SITE_PATHS) put(site, `${p}/index.html`, p);
  put(
    site,
    'sitemap.xml',
    `<urlset>${[SITE, ...LIVE_SITE_PATHS.map((p) => `${SITE}/${p}`), `${SITE}/llms.txt`]
      .map((u) => `<url><loc>${u}</loc></url>`)
      .join('')}</urlset>`,
  );
  await mergeSite({ seo: out, site, siteUrl: SITE });
  return out;
}

const isCanonical = (u) => {
  const path = new URL(u).pathname;
  return path.endsWith('/') || path.slice(path.lastIndexOf('/') + 1).includes('.');
};

for (const index of [false, true]) {
  test(`every sitemap address is canonical and the edge serves it without a redirect (${index ? 'sitemap index' : 'one sitemap'})`, async () => {
    const out = await publish({ index });
    const urls = allSitemapUrls(out);
    // All 21 company-site pages and the SEO pages are listed.
    for (const p of LIVE_SITE_PATHS) assert.ok(urls.includes(`${SITE}/${p}/`), `${p}/ missing`);
    assert.ok(urls.length > LIVE_SITE_PATHS.length + 1, 'SEO pages missing');
    assert.equal(new Set(urls).size, urls.length, 'an address is listed twice');

    const handler = edgeHandler();
    for (const u of urls) {
      assert.ok(u.startsWith(`${SITE}/`), u);
      assert.ok(isCanonical(u), `not canonical (no trailing slash): ${u}`);
      const uri = new URL(u).pathname;
      const r = await handler({ request: { uri, querystring: {}, headers: { host: { value: 'lawbid.dev' } } } });
      assert.notEqual(r.statusCode, 301, `the edge redirects a sitemap address: ${u}`);
      if (uri !== '/' && uri.endsWith('/')) {
        // A public page: its own index.html, not the app's page.
        assert.equal(r.uri, `${uri}index.html`, u);
        assert.ok(existsSync(join(out, r.uri)), `${r.uri} not in the publish`);
      }
    }
  });
}

test('the slash-less form of every sitemap page answers 301 to the canonical address', async () => {
  const handler = edgeHandler();
  for (const p of LIVE_SITE_PATHS) {
    const r = await handler({ request: { uri: `/${p}`, querystring: {}, headers: { host: { value: 'lawbid.dev' } } } });
    assert.equal(r.statusCode, 301, p);
    assert.equal(r.headers.location.value, `/${p}/`, p);
  }
});

test('the edge function code is not hidden from the Terraform apply (the 301 must reach CloudFront)', () => {
  const ignored = /ignore_changes\s*=\s*\[([^\]]*)\]/.exec(resource)?.[1] ?? '';
  assert.doesNotMatch(ignored, /\bcode\b/, 'seo_index has ignore_changes on code: the 301 never reaches the edge');
});
