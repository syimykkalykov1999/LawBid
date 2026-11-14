#!/usr/bin/env node
// S17-3 (2026-10-25): boot_head.js starts the app download BEFORE Flutter's
// loader runs, so it has to pick the same build as the loader. This check
// (run in web-deploy.yml after the build) reads the loader that is actually
// inside the pinned Flutter's flutter_bootstrap.js and fails when its
// decision logic is no longer the one boot_head.js mirrors. Then a Flutter
// bump must come with an update of boot_head.js (and of this check), instead
// of silently pre-downloading 6 MB of the wrong build.
//
// What boot_head.js mirrors (Flutter 3.47, flutter.js):
//   - wasm build only when WebAssembly.validate() accepts the WasmGC probe
//     module [0,97,115,109,1,0,0,0,1,5,1,95,1,120,0];
//   - only the blink engine (Chrome / Edge / Opera) runs it: the loader's
//     default allow list is {blink:true, gecko:false, webkit:false};
//   - engine detected by navigator.vendor === "Google Inc." or "Edg/" in the UA.
// Flutter 3.50+ also asks for JS string builtins and exnref (docs.flutter.dev
// /platform-integration/web/wasm, 2026-10-25): bumping the pin past 3.47 must
// add those probes to boot_head.js first; this check then looks for them.
//
// Usage: node scripts/deploy/web-boot-check.mjs <flutter_bootstrap.js> <boot_head.js> <flutter version>
import { readFileSync } from 'node:fs';

const [bootstrapPath, headPath, version = ''] = process.argv.slice(2);
if (!bootstrapPath || !headPath) {
  console.error('usage: web-boot-check.mjs <flutter_bootstrap.js> <boot_head.js> <flutter version>');
  process.exit(2);
}
const loader = readFileSync(bootstrapPath, 'utf8');
const head = readFileSync(headPath, 'utf8');

const checks = [
  ['loader has the WasmGC probe boot_head.js uses', loader.includes('[0,97,115,109,1,0,0,0,1,5,1,95,1,120,0]') && head.includes('0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0')],
  ['loader runs wasm only on blink by default (gecko/webkit off)', /\{blink:!0,gecko:!1,webkit:!1/.test(loader) || /blink:\s*true,\s*gecko:\s*false,\s*webkit:\s*false/.test(loader)],
  ['loader detects blink by vendor/UA like boot_head.js', loader.includes('navigator.vendor==="Google Inc."') && loader.includes('Edg/') && head.includes("'Google Inc.'") && head.includes("'Edg/'")],
  ['loader picks wasm by supportsWasmGC', loader.includes('supportsWasmGC')],
  // Row 170: our apps/mobile/web/flutter_bootstrap.js template is the one in
  // the build (no deprecated serviceWorkerSettings step), and its engine
  // revision is declared (web-immutable.py keys the engine folder on it).
  // (flutter.js itself has `load({serviceWorkerSettings:...})` as its own
  // parameter list, so only the last call, the template's, is looked at.)
  ['the build uses our flutter_bootstrap.js template (load({}), no service-worker step)', /_flutter\.loader\.load\(\{\}\);\s*$/.test(loader.slice(loader.lastIndexOf('_flutter.loader.load(')))],
  ['the build declares its engineRevision (40 hex)', /"engineRevision"\s*:\s*"[0-9a-f]{40}"/.test(loader)],
  ['boot_head.js has the engine folder placeholder', head.includes("'__LB_E__'")],
];
// A newer loader that also needs more features must be mirrored in boot_head.js.
const newer = /string[-_ ]?builtins|exnref|jsStringBuiltins/i.test(loader);
if (newer) {
  checks.push(['loader needs js-string-builtins / exnref: boot_head.js must probe them too', /builtins|exnref/i.test(head)]);
}

let bad = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) bad++;
}
if (bad) {
  console.error(`\nFlutter ${version}: the loader no longer matches apps/mobile/web/boot_head.js.`);
  console.error('Update boot_head.js (which build it pre-downloads) and this check together.');
  process.exit(1);
}
console.log(`boot_head.js matches the Flutter ${version} loader`);
