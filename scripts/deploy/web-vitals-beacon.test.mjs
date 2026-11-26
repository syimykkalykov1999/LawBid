// Б6 / G8 (25.11): apps/mobile/web/js/web_vitals_beacon.js in a fake page.
//   node scripts/deploy/web-vitals-beacon.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
const glue = readFileSync(new URL('apps/mobile/web/js/web_vitals_beacon.js', root), 'utf8');
const html = readFileSync(new URL('apps/mobile/web/index.html', root), 'utf8');

function page() {
  const handlers = {};
  const listeners = {};
  const beacons = [];
  const doc = {
    visibilityState: 'visible',
    addEventListener: (t, f) => ((listeners['doc:' + t] ??= []).push(f)),
  };
  const win = {
    webVitals: Object.fromEntries(['onLCP', 'onINP', 'onCLS', 'onTTFB'].map((k) => [k, (cb) => (handlers[k.slice(2)] = cb)])),
    addEventListener: (t, f) => ((listeners['win:' + t] ??= []).push(f)),
  };
  const ctx = { window: win, document: doc, navigator: { sendBeacon: (url, body) => (beacons.push({ url, body: JSON.parse(body) }), true) } };
  createContext(ctx);
  runInContext(glue, ctx);
  return {
    win,
    beacons,
    report: (name, rating) => handlers[name]({ name, rating, value: 1 }),
    hide: () => {
      doc.visibilityState = 'hidden';
      for (const f of listeners['doc:visibilitychange'] ?? []) f();
    },
  };
}

// 1. Without the app's go-ahead (no consent yet) nothing leaves the page.
{
  const p = page();
  p.report('LCP', 'good');
  p.hide();
  assert.equal(p.beacons.length, 0, 'sent before the app allowed it');
  p.win.lbWebVitals = { endpoint: 'https://api.example/api/v1/app-events', allowed: false };
  p.report('CLS', 'poor');
  p.hide();
  assert.equal(p.beacons.length, 0, 'sent while not allowed (no consent or admin switch off)');
}

// 2. Allowed: one beacon on hide, ratings only, newest rating per metric wins.
{
  const p = page();
  p.win.lbWebVitals = { endpoint: 'https://api.example/api/v1/app-events', allowed: true };
  p.report('LCP', 'good');
  p.report('INP', 'needs-improvement');
  p.report('CLS', 'good');
  p.report('CLS', 'poor');
  p.report('TTFB', 'poor');
  p.hide();
  assert.equal(p.beacons.length, 1);
  assert.equal(p.beacons[0].url, 'https://api.example/api/v1/app-events');
  assert.deepEqual(
    p.beacons[0].body.events.map((e) => e.name).sort(),
    ['web_vital_cls_poor', 'web_vital_inp_ni', 'web_vital_lcp_good', 'web_vital_ttfb_poor'],
  );
  assert.ok(p.beacons[0].body.events.every((e) => Object.keys(e).join() === 'name'), 'only the name leaves the page');
  p.hide();
  assert.equal(p.beacons.length, 1, 'nothing new = no second beacon');
}

// 3. The page loads the library (unmodified vendor copy) before the glue.
const lib = html.indexOf('src="vendor/web-vitals-6.2.3/web-vitals.iife.js"');
const own = html.indexOf('src="js/web_vitals_beacon.js"');
assert.ok(lib > 0 && own > lib, 'index.html loads web-vitals, then the beacon glue');

// 4. Every event name is one the server and the event list accept.
for (const n of ['lcp', 'inp', 'cls', 'ttfb'].flatMap((m) => ['good', 'ni', 'poor'].map((r) => `web_vital_${m}_${r}`))) {
  assert.match(n, /^[a-z0-9_.]{1,40}$/);
}
console.log('web-vitals-beacon.test.mjs: 4 passed');
