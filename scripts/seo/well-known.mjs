#!/usr/bin/env node
// Owner 2026-10-20: app links. The two files that let a phone open
// https://lawbid.dev/u/…, /q/…, /g/… (and the older links) in the app
// instead of the browser:
//
//   /.well-known/apple-app-site-association   iOS (Team 78T56RPM74)
//   /.well-known/assetlinks.json              Android (package com.lawbid.lawbid)
//
// Published by seo-deploy.yml next to the SEO pages. The Android file needs
// the SHA-256 of the certificate Google Play signs the app with (Play
// Console → Test and release → App integrity → App signing key
// certificate); it is read from --android-sha256 / ANDROID_APP_SHA256
// (comma-separated, so the upload key can be listed too). Without it the
// Android file is NOT written: a made-up fingerprint would only look valid.
//
// Usage: node scripts/seo/well-known.mjs --out dist-seo [--android-sha256 AA:BB:…]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const TEAM_ID = '78T56RPM74';
export const BUNDLE_ID = 'com.lawbid.lawbid';
export const ANDROID_PACKAGE = 'com.lawbid.lawbid';

/** Paths the app opens (keep in step with AndroidManifest.xml). */
export const APP_PATHS = [
  ['/r/*', 'Referral link (lawbid.dev/r/<CODE>)'],
  ['/case/*', 'Case'],
  ['/lawyer/*', 'Attorney profile by @username'],
  ['/post/*', 'Post'],
  ['/u/*', 'Profile QR code: a user by @username'],
  ['/q/*', 'Website sign-in QR code'],
  ['/g/*', 'Group invitation'],
  ['/c/*', 'Channel (lawbid.dev/c/<username>)'],
  ['/auth/email-code', 'Email magic sign-in link'],
];

export function appleAppSiteAssociation() {
  return {
    // Owner 2026-10-22: passkeys (WebAuthn) — the iOS app may create and
    // use passkeys for the relying party lawbid.dev (API: auth/passkeys).
    webcredentials: { apps: [`${TEAM_ID}.${BUNDLE_ID}`] },
    applinks: {
      details: [
        {
          appIDs: [`${TEAM_ID}.${BUNDLE_ID}`],
          components: APP_PATHS.map(([path, comment]) => ({
            '/': path,
            comment,
          })),
        },
      ],
    },
  };
}

/** "aa:bb…" or "AABB…" → "AA:BB:…"; null when it is not 32 bytes of hex. */
export function normalizeFingerprint(raw) {
  const hex = String(raw).trim().replace(/:/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  return hex.match(/../g).join(':');
}

export function parseFingerprints(list) {
  const out = [];
  for (const part of String(list ?? '').split(/[,\s]+/)) {
    if (!part) continue;
    const f = normalizeFingerprint(part);
    if (!f) throw new Error(`not a SHA-256 certificate fingerprint: "${part}"`);
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

export function assetLinks(fingerprints) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export async function writeWellKnown({ out, androidSha256 }) {
  const dir = join(out, '.well-known');
  await mkdir(dir, { recursive: true });
  const written = ['apple-app-site-association'];
  await writeFile(
    join(dir, 'apple-app-site-association'),
    `${JSON.stringify(appleAppSiteAssociation(), null, 2)}\n`,
  );
  const fingerprints = parseFingerprints(androidSha256);
  if (fingerprints.length > 0) {
    await writeFile(
      join(dir, 'assetlinks.json'),
      `${JSON.stringify(assetLinks(fingerprints), null, 2)}\n`,
    );
    written.push('assetlinks.json');
  }
  return written;
}

if (process.argv[1] && process.argv[1].endsWith('well-known.mjs')) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const out = arg('out', 'dist-seo');
  const sha = arg('android-sha256', process.env.ANDROID_APP_SHA256 ?? '');
  const written = await writeWellKnown({ out, androidSha256: sha });
  console.log(`well-known: wrote ${written.join(', ')} in ${out}/.well-known`);
  if (!written.includes('assetlinks.json')) {
    console.log(
      '::warning::ANDROID_APP_SHA256 is not set: assetlinks.json was not published, ' +
        'Android keeps opening lawbid.dev links in the browser until the Play app-signing SHA-256 is added.',
    );
  }
}
