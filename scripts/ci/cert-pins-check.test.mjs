// node --test scripts/ci/cert-pins-check.test.mjs (Repo guards self-tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ANDROID_NSC,
  IOS_PLIST,
  parseAndroid,
  parseIos,
  staticProblems,
} from './cert-pins-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const A = 'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=';
const B = '++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=';
const NOW = new Date('2026-11-25T00:00:00Z');

const nsc = (pins, exp = '2027-11-25') => `<network-security-config>
  <!-- <domain-config><domain>commented.example</domain><pin-set><pin digest="SHA-256">x</pin></pin-set></domain-config> -->
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">api.example</domain>
    <pin-set${exp ? ` expiration="${exp}"` : ''}>
${pins.map((p) => `      <pin digest="SHA-256">${p}</pin>`).join('\n')}
    </pin-set>
  </domain-config>
  <domain-config cleartextTrafficPermitted="true"><domain>127.0.0.1</domain></domain-config>
</network-security-config>`;

const plist = (pins) => `<plist><dict>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSPinnedDomains</key>
    <dict>
      <key>api.example</key>
      <dict>
        <key>NSIncludesSubdomains</key><false/>
        <key>NSPinnedCAIdentities</key>
        <array>
${pins.map((p) => `          <dict><key>SPKI-SHA256-BASE64</key><string>${p}</string></dict>`).join('\n')}
        </array>
      </dict>
    </dict>
  </dict>
</dict></plist>`;

test('equal pins on both platforms pass', () => {
  assert.deepEqual(staticProblems(parseAndroid(nsc([A, B])), parseIos(plist([A, B])), NOW), []);
});

test('commented-out domain-configs and the loopback config are ignored', () => {
  assert.deepEqual(Object.keys(parseAndroid(nsc([A, B])).hosts), ['api.example']);
});

test('a pin on one platform only fails', () => {
  const p = staticProblems(parseAndroid(nsc([A, B])), parseIos(plist([A])), NOW);
  assert.ok(p.some((x) => x.includes('Android only')), p.join('\n'));
});

test('no expiration fails (old builds must fail open)', () => {
  const p = staticProblems(parseAndroid(nsc([A, B], '')), parseIos(plist([A, B])), NOW);
  assert.ok(p.some((x) => x.includes('no expiration')), p.join('\n'));
});

test('an expiration closer than 60 days fails', () => {
  const p = staticProblems(parseAndroid(nsc([A, B], '2026-12-20')), parseIos(plist([A, B])), NOW);
  assert.ok(p.some((x) => x.includes('expires')), p.join('\n'));
});

test('a malformed pin and a single pin fail', () => {
  const p = staticProblems(parseAndroid(nsc(['abc'])), parseIos(plist(['abc'])), NOW);
  assert.ok(p.some((x) => x.includes('not a base64 SHA-256')), p.join('\n'));
  assert.ok(p.some((x) => x.includes('one pin only')), p.join('\n'));
});

test('the real app files: same hosts and pins, expiration ahead', () => {
  const android = parseAndroid(read(ANDROID_NSC));
  const ios = parseIos(read(IOS_PLIST));
  assert.deepEqual(Object.keys(android.hosts).sort(), ['api.lawbid.dev', 'media.lawbid.dev']);
  assert.deepEqual(staticProblems(android, ios), []);
  // The ACM root of the API today (Amazon Root CA 1) is pinned.
  assert.ok(android.hosts['api.lawbid.dev'].has(B));
});
