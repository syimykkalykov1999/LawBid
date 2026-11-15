#!/usr/bin/env node
// Row 170 (14.11): boot_head.js pre-downloads the engine (canvaskit/...) from
// the engine's folder (E, v/<engineRevision>) and the app from the release
// folder (V, v/<sha>). Runs the real file in a stub browser.
//   node scripts/deploy/web-boot-head.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../../apps/mobile/web/boot_head.js', import.meta.url)), 'utf8');
const SHA = 'ea3ed5318abcdef0123456789abcdef012345678';
const REV = 'af7e796e161ae0bb1ff0758c71a7105418bd9ded';
const ORIGIN = 'https://lawbid.dev';

function run({ v, e, chrome }) {
  const links = [];
  const fetched = [];
  const code = src.replace('__LB_V__', v).replace('__LB_E__', e);
  const fetch = (u) => {
    fetched.push(typeof u === 'string' ? u : u.url);
    return Promise.resolve({ ok: true, status: 200, body: { getReader: () => ({ read: () => Promise.resolve({ done: true }), cancel() {} }) } });
  };
  const document = {
    baseURI: ORIGIN + '/',
    head: { appendChild: (l) => links.push([l.rel, l.href]) },
    createElement: () => ({}),
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: { style: { setProperty() {} } },
  };
  const window = {
    fetch, addEventListener() {}, localStorage: { getItem: () => null },
    scrollY: 0, scrollX: 0,
  };
  const ctx = {
    window, document, URL, WebAssembly, ReadableStream, Response, setTimeout, Promise, Uint8Array, JSON, Date,
    navigator: chrome
      ? { vendor: 'Google Inc.', userAgent: 'Mozilla/5.0 Chrome/141.0' }
      : { vendor: 'Apple Computer, Inc.', userAgent: 'Mozilla/5.0 Version/26.0 Safari/605.1.15' },
    location: { origin: ORIGIN },
    MutationObserver: class { observe() {} },
    PerformanceObserver: class { observe() {} },
  };
  vm.runInNewContext(code, ctx);
  return { links, fetched };
}

let bad = 0;
function check(name, ok, got) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' :: ' + JSON.stringify(got)}`);
  if (!ok) bad++;
}
const has = (list, x) => list.some((l) => JSON.stringify(l) === JSON.stringify(x));

{
  const r = run({ v: `v/${SHA}`, e: `v/${REV}`, chrome: true });
  check('Chrome: app module from the release folder', has(r.links, ['modulepreload', `v/${SHA}/main.dart.mjs`]), r.links);
  check('Chrome: skwasm.js from the engine folder', has(r.links, ['modulepreload', `v/${REV}/canvaskit/skwasm.js`]), r.links);
  check('Chrome: main.dart.wasm fetched from the release folder', r.fetched.includes(`${ORIGIN}/v/${SHA}/main.dart.wasm`), r.fetched);
  check('Chrome: skwasm.wasm fetched from the engine folder', r.fetched.includes(`${ORIGIN}/v/${REV}/canvaskit/skwasm.wasm`), r.fetched);
  check('Chrome: nothing of the engine from the release folder', !JSON.stringify(r).includes(`v/${SHA}/canvaskit`), r);
}
{
  const r = run({ v: `v/${SHA}`, e: `v/${REV}`, chrome: false });
  check('Safari: main.dart.js from the release folder', has(r.links, ['preload', `v/${SHA}/main.dart.js`]), r.links);
  check('Safari: canvaskit.js from the engine folder', has(r.links, ['preload', `v/${REV}/canvaskit/canvaskit.js`]), r.links);
  check('Safari: canvaskit.wasm fetched from the engine folder', r.fetched.includes(`${ORIGIN}/v/${REV}/canvaskit/canvaskit.wasm`), r.fetched);
}
{
  // An older deploy script that fills only __LB_V__: the engine stays with the release.
  const r = run({ v: `v/${SHA}`, e: '__LB_E__', chrome: true });
  check('E not filled: engine from the release folder (old layout)', r.fetched.includes(`${ORIGIN}/v/${SHA}/canvaskit/skwasm.wasm`), r.fetched);
}
{
  // A local build: no placeholder filled, nothing pre-started.
  const r = run({ v: '__LB_V__', e: '__LB_E__', chrome: true });
  check('local build: nothing pre-downloaded', r.links.length === 0 && r.fetched.length === 0, r);
}
if (bad) { console.error(`${bad} boot_head.js check(s) failed`); process.exit(1); }
console.log('boot_head.js: all checks passed');
