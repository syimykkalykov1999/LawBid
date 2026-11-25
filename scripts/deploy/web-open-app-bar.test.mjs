#!/usr/bin/env node
// Pack F (25.11, ROUND5 F7): the «Open in LawBid» offer of boot_end.js on a
// phone's browser. Runs the real block in a stub browser:
//   - iOS never gets our lawbid:// bar (Safari: "the address is invalid"
//     when the app is missing); with an App Store id it gets Apple's Smart
//     App Banner meta, without one nothing;
//   - Android gets Chrome's intent:// link whose fallback is this page while
//     the app is not in Play (never a Play page that does not exist yet);
//   - /c/ and /attorneys/ links get the offer too.
//   node scripts/deploy/web-open-app-bar.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../../apps/mobile/web/boot_end.js', import.meta.url)), 'utf8');
const start = src.indexOf('(function () {\n      /* Fill in when the store listings are live. */');
assert.ok(start > 0, 'the open-in-app block is not found in boot_end.js');
const end = src.indexOf('    })();', start);
const block = src.slice(start, end + '    })();'.length);

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/141.0 Mobile Safari/537.36';

function run({ path, ua, code = block }) {
  const head = [];
  const body = [];
  const el = (tag) => ({ tag, style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); } });
  const document = {
    head: { appendChild: (n) => head.push(n) },
    body: { appendChild: (n) => body.push(n) },
    createElement: el,
    querySelector: () => null,
  };
  const location = { pathname: path, search: '', host: 'lawbid.dev', href: `https://lawbid.dev${path}` };
  vm.runInNewContext(code, {
    document, location, navigator: { userAgent: ua, language: 'en-US' },
    sessionStorage: { getItem: () => null, setItem() {} },
  });
  const bar = body[0];
  const link = bar ? bar.children.find((c) => c.tag === 'a') : null;
  return { head, bar, href: link ? link.href : null };
}

let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

check('iOS without an App Store id: no bar, no lawbid:// link, no banner', () => {
  const r = run({ path: '/lawyer/anna', ua: IOS });
  assert.equal(r.bar, undefined);
  assert.equal(r.head.length, 0);
  assert.doesNotMatch(block, /lawbid:\/\//);
});

check('iOS with an App Store id: Apple\'s Smart App Banner meta with this page as the argument', () => {
  const r = run({ path: '/lawyer/anna', ua: IOS, code: block.replace("var APP_STORE_ID = '';", "var APP_STORE_ID = '1234567890';") });
  assert.equal(r.bar, undefined);
  assert.equal(r.head[0].name, 'apple-itunes-app');
  assert.equal(r.head[0].content, 'app-id=1234567890, app-argument=https://lawbid.dev/lawyer/anna');
});

check('Android before Play: intent:// to the app, the fallback is this page, never Play', () => {
  const r = run({ path: '/case/abc', ua: ANDROID });
  assert.match(r.href, /^intent:\/\/lawbid\.dev\/case\/abc#Intent;scheme=https;package=com\.lawbid\.lawbid;/);
  assert.match(r.href, /S\.browser_fallback_url=https%3A%2F%2Flawbid\.dev%2Fcase%2Fabc;end$/);
  assert.doesNotMatch(r.href, /play\.google\.com/);
});

check('Android once in Play: the fallback is the Play listing', () => {
  const r = run({ path: '/case/abc', ua: ANDROID, code: block.replace('var PLAY_LISTED = false;', 'var PLAY_LISTED = true;') });
  assert.match(r.href, /S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com%2F/);
});

check('/c/ and /attorneys/ links get the offer; other screens and desktops do not', () => {
  assert.ok(run({ path: '/c/xyz', ua: ANDROID }).bar);
  assert.ok(run({ path: '/attorneys/anna.lee', ua: ANDROID }).bar);
  assert.equal(run({ path: '/chats', ua: ANDROID }).bar, undefined);
  assert.equal(run({ path: '/c/xyz', ua: 'Mozilla/5.0 (Macintosh) Chrome/141.0' }).bar, undefined);
});

console.log(`boot_end.js open-in-app: ${n} checks passed`);
