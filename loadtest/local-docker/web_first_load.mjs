// Web first load (round 2 of docs/perf/LOCAL_LOAD_TEST_2026-10-28.md): what a
// browser downloads before the first screen of the Flutter web build, raw /
// gzip / brotli, and the transfer time at typical link speeds.
//   node web_first_load.mjs <apps/mobile/build/web>
// Two paths, as flutter_bootstrap.js chooses: dart2wasm + skwasm (Chrome,
// Edge, Firefox with WasmGC) and dart2js + CanvasKit (Safari, older browsers).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { join } from 'node:path';

const dir = process.argv[2];
// The engine loads every font of FontManifest.json at start-up.
const fonts = [...new Set(JSON.parse(readFileSync(join(dir, 'assets/FontManifest.json'), 'utf8'))
  .flatMap((f) => f.fonts.map((x) => `assets/${x.asset}`)))];
const common = ['index.html', 'boot_head.js', 'boot_end.js', 'flutter_bootstrap.js', 'manifest.json',
  'assets/FontManifest.json', 'assets/AssetManifest.bin.json', ...fonts, 'sqlite3.wasm', 'drift_worker.js'];
const paths = {
  'wasm (Chrome/Edge/Firefox)': [...common, 'main.dart.mjs', 'main.dart.wasm', 'canvaskit/skwasm.js', 'canvaskit/skwasm.wasm'],
  'js (Safari/older)': [...common, 'main.dart.js', 'canvaskit/canvaskit.js', 'canvaskit/canvaskit.wasm'],
};
const kb = (n) => (n / 1024).toFixed(0);
for (const [name, files] of Object.entries(paths)) {
  let raw = 0, gz = 0, br = 0;
  const rows = [];
  for (const f of files) {
    const p = join(dir, f);
    if (!existsSync(p)) { rows.push(`  (missing) ${f}`); continue; }
    const b = readFileSync(p);
    const g = gzipSync(b, { level: 9 }).length;
    const r = brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    raw += b.length; gz += g; br += r;
    rows.push(`  ${f.padEnd(62)} ${kb(b.length).padStart(7)} KB  gz ${kb(g).padStart(6)}  br ${kb(r).padStart(6)}`);
  }
  console.log(`== ${name}`);
  console.log(rows.join('\n'));
  console.log(`  TOTAL raw ${kb(raw)} KB, gzip ${kb(gz)} KB, brotli ${kb(br)} KB`);
  for (const mbit of [5, 20, 100]) {
    console.log(`  transfer at ${mbit} Mbit/s: gzip ${(gz * 8 / mbit / 1e6).toFixed(1)} s, brotli ${(br * 8 / mbit / 1e6).toFixed(1)} s`);
  }
}
const all = statSync(dir);
void all;
