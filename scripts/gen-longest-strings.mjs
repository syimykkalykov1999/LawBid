// Node twin of apps/mobile/tool/gen_longest_strings.py (no openpyxl needed):
// for every key the longest translation among the languages the test fonts
// can draw, written to apps/mobile/test/l10n/longest_strings.json.
// Usage: node scripts/gen-longest-strings.mjs
// Also writes test/l10n/lang_<code>.json for the languages whose real text
// the overflow tests pump as is (Nepali, Arabic, Marathi, German: the longest
// texts by owner's measure).
import { readSeed } from './lib/translations-seed.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LANGS = ('en ru es fr de it pt nl pl uk tr el cs sk hu ro bg hr sr sl da sv nb fi ' +
  'ca vi id ms tl ky kk uz ht tk mn be lt lv et mk bs sw af zu yo ig ha ku ' +
  'eu gl is ga cy mt sq az tg').split(' ');
const PH = /\{[a-zA-Z0-9_]+\}/g;
const ph = (s) => (s.match(PH) ?? []).sort().join('|');
const { rows } = readSeed();
const out = {};
const ONE_LANG = ['ne', 'ar', 'de', 'mr'];
const single = Object.fromEntries(ONE_LANG.map((l) => [l, {}]));
for (const { key, cells } of rows) {
  const en = cells.en;
  if (!key || !en) continue;
  const want = ph(en);
  let best = en;
  for (const lang of LANGS) {
    const s = cells[lang] ?? '';
    if (s && ph(s) === want && s.length > best.length) best = s;
  }
  out[key] = best;
  for (const l of ONE_LANG) {
    const s = cells[l] ?? '';
    single[l][key] = s && ph(s) === want ? s : en;
  }
}
const keys = Object.keys(out).sort();
const file = path.join(ROOT, 'apps/mobile/test/l10n/longest_strings.json');
fs.writeFileSync(file, '{\n' + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(out[k])}`).join(',\n') + '\n}');
console.log(`${keys.length} keys -> ${path.relative(ROOT, file)}`);
for (const l of ONE_LANG) {
  const f = path.join(ROOT, `apps/mobile/test/l10n/lang_${l}.json`);
  fs.writeFileSync(f, '{\n' + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(single[l][k])}`).join(',\n') + '\n}');
  console.log(`${l} -> ${path.relative(ROOT, f)}`);
}
