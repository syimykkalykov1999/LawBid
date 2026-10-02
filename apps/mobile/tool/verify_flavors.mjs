#!/usr/bin/env node
// Builds every app flavor and checks the installed identity of each
// artifact (p12 leaf-1.4: three variants side by side).
//
//   node tool/verify_flavors.mjs android   -> prints ANDROID_FLAVORS_OK
//   node tool/verify_flavors.mjs ios       -> prints IOS_FLAVORS_OK
//
// android: `flutter build apk --debug --flavor <f> -t lib/main_<f>.dart`,
//          then `aapt dump badging` (Android SDK build-tools; apkanalyzer as
//          a fallback) for the package name and application label.
// ios:     `flutter build ios --no-codesign --debug --simulator --flavor <f>
//          -t lib/main_<f>.dart`, then `plutil` on the built Info.plist for
//          CFBundleIdentifier / CFBundleDisplayName.
//
// Run from apps/mobile. Exits non-zero (and prints *_FLAVORS_FAILED) on
// any mismatch or build failure.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EXPECTED = {
  dev: { id: 'com.lawbid.lawbid.dev', name: 'LawBid' },
  staging: { id: 'com.lawbid.lawbid.staging', name: 'LawBid Staging' },
  prod: { id: 'com.lawbid.lawbid', name: 'LawBid' },
};

const mode = process.argv[2];
if (mode !== 'android' && mode !== 'ios') {
  console.error('usage: node tool/verify_flavors.mjs <android|ios>');
  process.exit(2);
}
if (!existsSync('pubspec.yaml') || !existsSync('lib/main_dev.dart')) {
  console.error('run from apps/mobile');
  process.exit(2);
}

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${res.status}`);
}

function capture(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sdkRoot() {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
}

function findAapt() {
  const bt = join(sdkRoot(), 'build-tools');
  if (!existsSync(bt)) return null;
  const versions = readdirSync(bt).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    for (const tool of ['aapt', 'aapt2']) {
      const p = join(bt, v, tool);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function inspectApk(apk) {
  const aapt = findAapt();
  if (aapt) {
    const out = capture(aapt, ['dump', 'badging', apk]);
    const pkg = out.match(/^package: name='([^']+)'/m)?.[1];
    const label = out.match(/^application-label:'([^']*)'/m)?.[1] ?? out.match(/^application: label='([^']*)'/m)?.[1];
    return { id: pkg, name: label };
  }
  const analyzer = join(sdkRoot(), 'cmdline-tools/latest/bin/apkanalyzer');
  if (!existsSync(analyzer)) throw new Error('neither aapt nor apkanalyzer found in the Android SDK');
  const id = capture(analyzer, ['manifest', 'application-id', apk]).trim();
  const labelRef = capture(analyzer, ['manifest', 'print', apk]).match(/android:label="([^"]+)"/)?.[1];
  let name = labelRef;
  if (labelRef?.startsWith('@string/')) {
    const key = labelRef.slice('@string/'.length);
    name = capture(analyzer, ['resources', 'value', '--config', 'default', '--name', key, '--type', 'string', apk]).trim();
  }
  return { id, name };
}

function plistValue(plist, key) {
  return capture('plutil', ['-extract', key, 'raw', '-o', '-', plist]).trim();
}

function findIosInfoPlist(flavor) {
  const candidates = [
    `build/ios/Debug-${flavor}-iphonesimulator/Runner.app/Info.plist`,
    'build/ios/iphonesimulator/Runner.app/Info.plist',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`no built Info.plist for ${flavor} (looked in ${candidates.join(', ')})`);
  return found;
}

const results = [];
let ok = true;
try {
  for (const [flavor, expected] of Object.entries(EXPECTED)) {
    let actual;
    if (mode === 'android') {
      run('flutter', ['build', 'apk', '--debug', '--flavor', flavor, '-t', `lib/main_${flavor}.dart`]);
      const apk = `build/app/outputs/flutter-apk/app-${flavor}-debug.apk`;
      if (!existsSync(apk)) throw new Error(`missing ${apk}`);
      actual = inspectApk(apk);
    } else {
      run('flutter', ['build', 'ios', '--no-codesign', '--debug', '--simulator', '--flavor', flavor, '-t', `lib/main_${flavor}.dart`]);
      const plist = findIosInfoPlist(flavor);
      actual = { id: plistValue(plist, 'CFBundleIdentifier'), name: plistValue(plist, 'CFBundleDisplayName') };
    }
    const match = actual.id === expected.id && actual.name === expected.name;
    ok &&= match;
    results.push({ flavor, expected, actual, match });
  }
} catch (e) {
  console.error(String(e?.message ?? e));
  ok = false;
}

console.log('');
for (const r of results) {
  console.log(
    `${r.match ? 'OK  ' : 'FAIL'} ${r.flavor.padEnd(8)} id=${r.actual.id} name="${r.actual.name}"` +
      (r.match ? '' : `  (expected id=${r.expected.id} name="${r.expected.name}")`),
  );
}
const ids = new Set(results.map((r) => r.actual.id));
if (results.length !== 3 || ids.size !== 3) ok = false;

const tag = mode === 'android' ? 'ANDROID' : 'IOS';
if (ok) {
  console.log(`${tag}_FLAVORS_OK`);
} else {
  console.log(`${tag}_FLAVORS_FAILED`);
  process.exit(1);
}
