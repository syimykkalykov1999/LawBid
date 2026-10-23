import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  APP_PATHS,
  appleAppSiteAssociation,
  normalizeFingerprint,
  parseFingerprints,
  writeWellKnown,
} from '../well-known.mjs';

const FP = Array.from({ length: 32 }, (_, i) => (i * 7 + 1).toString(16).padStart(2, '0').toUpperCase()).join(':');

test('iOS file: team + bundle id and the QR, sign-in and group paths', () => {
  const j = appleAppSiteAssociation();
  const d = j.applinks.details[0];
  assert.deepEqual(d.appIDs, ['78T56RPM74.com.lawbid.lawbid']);
  assert.deepEqual(j.webcredentials, { apps: ['78T56RPM74.com.lawbid.lawbid'] });
  const paths = d.components.map((c) => c['/']);
  assert.deepEqual(j.webcredentials, { apps: ['78T56RPM74.com.lawbid.lawbid'] });
  for (const p of ['/u/*', '/q/*', '/g/*', '/lawyer/*', '/case/*', '/post/*', '/r/*', '/auth/email-code']) {
    assert.ok(paths.includes(p), p);
  }
});

test('the checked-in copy in docs/deeplinks is the generated file', () => {
  const docs = JSON.parse(
    readFileSync(new URL('../../../docs/deeplinks/apple-app-site-association', import.meta.url), 'utf8'),
  );
  assert.deepEqual(docs, appleAppSiteAssociation());
});

test('fingerprints: any common spelling → AA:BB:…; junk is refused', () => {
  assert.equal(normalizeFingerprint(FP.toLowerCase()), FP);
  assert.equal(normalizeFingerprint(FP.replace(/:/g, '')), FP);
  assert.equal(normalizeFingerprint('SHA256_PROD_PLAY_APP_SIGNING_CERT'), null);
  assert.deepEqual(parseFingerprints(`${FP}, ${FP}`), [FP]);
  assert.deepEqual(parseFingerprints(''), []);
  assert.throws(() => parseFingerprints('placeholder'));
});

test('files are written; assetlinks.json only with a real fingerprint', async () => {
  const out = mkdtempSync(join(tmpdir(), 'wk-'));
  const none = await writeWellKnown({ out, androidSha256: '' });
  assert.deepEqual(none, ['apple-app-site-association']);
  assert.equal(existsSync(join(out, '.well-known/assetlinks.json')), false);
  JSON.parse(readFileSync(join(out, '.well-known/apple-app-site-association'), 'utf8'));

  const both = await writeWellKnown({ out, androidSha256: FP });
  assert.deepEqual(both, ['apple-app-site-association', 'assetlinks.json']);
  const links = JSON.parse(readFileSync(join(out, '.well-known/assetlinks.json'), 'utf8'));
  assert.equal(links[0].target.package_name, 'com.lawbid.lawbid');
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [FP]);
  assert.deepEqual(links[0].relation, [
    'delegate_permission/common.handle_all_urls',
    'delegate_permission/common.get_login_creds',
  ]);
});

test('Android manifest opens the same paths as the iOS file', () => {
  const manifest = readFileSync(
    new URL('../../../apps/mobile/android/app/src/main/AndroidManifest.xml', import.meta.url),
    'utf8',
  );
  assert.match(manifest, /android:autoVerify="true"/);
  const android = new Set(
    [...manifest.matchAll(/android:(?:pathPrefix|path)="(\/[^"]*)"/g)].map((m) => m[1]),
  );
  const ios = APP_PATHS.map(([p]) => p.replace(/\*$/, ''));
  for (const p of ios) assert.ok(android.has(p), `AndroidManifest.xml is missing ${p}`);
  for (const p of android) assert.ok(ios.includes(p), `apple-app-site-association is missing ${p}`);
});
