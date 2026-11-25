// Runs the viewer-request CloudFront Function `seo_index` (the code in
// infra/modules/web/main.tf) against plain request objects, with a stub
// key-value store, so the edge rules for public pages are tested in CI.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const tf = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "infra",
    "modules",
    "web",
    "main.tf",
  ),
  "utf8",
);
const block =
  /resource "aws_cloudfront_function" "seo_index" \{[\s\S]*?code\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT\n/.exec(
    tf,
  );
assert.ok(block, "seo_index code block not found in main.tf");
const source = block[1]
  .replace("import cf from 'cloudfront';", "")
  .replace(/\$\{element\([^}]*\)\}/, "store-id")
  .replace(/\$\$\{/g, "${");

function load(store = {}) {
  const cf = {
    kvs: () => ({
      get: async (k) =>
        k in store ? store[k] : Promise.reject(new Error("missing")),
    }),
  };
  return vm.runInNewContext(`${source}\n;handler`, { cf });
}

const req = (uri, querystring = {}, host = "lawbid.dev") => ({
  request: { uri, querystring, headers: { host: { value: host } } },
});

test("a public page without the trailing slash answers 301 to the slash form (R2 row 171)", async () => {
  const handler = load();
  for (const uri of [
    "/clients",
    "/pricing",
    "/faq",
    "/attorneys/anna-lee",
    "/practice-areas/divorce",
    "/legal-questions/can-i-sue",
  ]) {
    const r = await handler(req(uri));
    assert.equal(r.statusCode, 301, uri);
    assert.equal(r.headers.location.value, `${uri}/`, uri);
  }
});

test("the 301 keeps the query string", async () => {
  const handler = load();
  const r = await handler(
    req("/pricing", { utm_source: { value: "x" }, ref: { value: "" } }),
  );
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, "/pricing/?utm_source=x&ref");
});

test("a public page with the slash is served from its index.html", async () => {
  const handler = load();
  const r = await handler(req("/clients/"));
  assert.equal(r.uri, "/clients/index.html");
  assert.equal(r.statusCode, undefined);
});

test("a public file keeps its address", async () => {
  const handler = load();
  const r = await handler(req("/about/og.png"));
  assert.equal(r.uri, "/about/og.png");
});

test("www still answers 301 to the bare host", async () => {
  const handler = load();
  const r = await handler(req("/clients", {}, "www.lawbid.dev"));
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, "https://lawbid.dev/clients");
});

test("an app screen is not redirected", async () => {
  const handler = load({ web_release: "abc1234", web_app_paths: "assets,v" });
  const r = await handler(req("/chats"));
  assert.equal(r.statusCode, undefined);
  assert.equal(r.uri, "/releases/abc1234/spa.html");
});

// Pack F (25.11, ROUND5 F3): og:image / twitter:image of every site page is
// /opengraph-image (a Next.js metadata file without an extension). It went
// to the app's spa.html (text/html), so link previews had no picture.
test("the link-preview images are served as the root files, not as an app screen", async () => {
  const handler = load({ web_release: "abc1234", web_app_paths: "assets,v" });
  for (const uri of ["/opengraph-image", "/twitter-image"]) {
    const r = await handler(req(uri, { "47bb": { value: "" } }));
    assert.equal(r.statusCode, undefined, uri);
    assert.equal(r.uri, uri, uri);
  }
});

// Pack F (ROUND5 F2): the site's /attorneys/ and /practice-areas/ index pages
// (Next.js, inline scripts) get the site's CSP by exact path; the stale
// for-attorneys prefix is gone; the app's policy carries no 'unsafe-inline'.
test("site CSP paths: exact /attorneys/ and /practice-areas/, no for-attorneys", () => {
  const sitePaths = /site_paths = \[([\s\S]*?)\]/.exec(tf)[1];
  assert.doesNotMatch(sitePaths, /for-attorneys/);
  assert.match(tf, /site_exact_paths = \["\/attorneys\/", "\/practice-areas\/"\]/);
  assert.match(tf, /for_each = concat\(\[for p in local\.site_paths : "\/\$\{p\}\*"\], local\.site_exact_paths\)/);
  const app = /\n\s+app\s+= join\(([^\n]*)\n/.exec(tf)[1];
  assert.doesNotMatch(app, /unsafe-inline/);
  assert.match(app, /flutterfire_script_hashes/);
});
