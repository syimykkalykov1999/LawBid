// R2 row 174 (14.11): the home page is the Flutter web app's index.html.
// Search engines read it as is (the app draws on a canvas), so it carries
// the canonical address and the schema.org Organization + WebSite data,
// as the company site's pages do (LawBidSite structured-data.tsx).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const html = readFileSync(
  join(root, "apps", "mobile", "web", "index.html"),
  "utf8",
);
const head = html.slice(0, html.indexOf("</head>"));
const jsonLd = [
  ...head.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  ),
].map((m) => JSON.parse(m[1]));

test("the home page names its canonical address", () => {
  const links = [
    ...head.matchAll(/<link rel="canonical" href="([^"]+)">/g),
  ].map((m) => m[1]);
  assert.deepEqual(links, ["https://lawbid.dev/"]);
});

test("the home page carries schema.org Organization and WebSite", () => {
  const org = jsonLd.find((d) => d["@type"] === "Organization");
  const site = jsonLd.find((d) => d["@type"] === "WebSite");
  assert.ok(org, "Organization");
  assert.ok(site, "WebSite");
  for (const d of [org, site]) {
    assert.equal(d["@context"], "https://schema.org");
    assert.equal(d.name, "LawBid");
    assert.equal(d.url, "https://lawbid.dev/");
  }
  assert.match(org.logo, /^https:\/\/lawbid\.dev\/icons\/Icon-512\.png$/);
});

test("app screens (spa.html, noindex) do not claim the home page as canonical", () => {
  const deploy = readFileSync(
    join(root, ".github", "workflows", "web-deploy.yml"),
    "utf8",
  );
  assert.match(deploy, /sed '\/rel="canonical"\/d' index\.html > spa\.html/);
  assert.doesNotMatch(deploy, /cp index\.html spa\.html/);
  // The sed drops one whole line: the canonical link must sit alone on its line.
  const line = html.split("\n").find((l) => l.includes('rel="canonical"'));
  assert.equal(
    line.trim(),
    '<link rel="canonical" href="https://lawbid.dev/">',
  );
});
