// Node twin of apps/mobile/tool/gen_longest_strings.py (no openpyxl needed):
// for every key the longest translation among the languages the test fonts
// can draw, written to apps/mobile/test/l10n/longest_strings.json.
// Usage: node scripts/gen-longest-strings.mjs
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LANGS = ('en ru es fr de it pt nl pl uk tr el cs sk hu ro bg hr sr sl da sv nb fi ' +
  'ca vi id ms tl ky kk uz ht tk mn be lt lv et mk bs sw af zu yo ig ha ku ' +
  'eu gl is ga cy mt sq az tg').split(' ');
const PH = /\{[a-zA-Z0-9_]+\}/g;
const ph = (s) => (s.match(PH) ?? []).sort().join('|');
const text = (v) => (v == null ? '' : typeof v === 'object' ? (v.richText ? v.richText.map((r) => r.text).join('') : String(v.text ?? v.result ?? '')) : String(v));

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join(ROOT, 'apps/api/prisma/seed/translations_seed.xlsx'));
const ws = wb.worksheets[0];
const header = Array.from(ws.getRow(1).values, text);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const out = {};
ws.eachRow((row, n) => {
  if (n === 1) return;
  const v = row.values;
  const key = text(v[1]);
  const en = text(v[col.en]);
  if (!key || !en) return;
  const want = ph(en);
  let best = en;
  for (const lang of LANGS) {
    const s = text(v[col[lang]]);
    if (s && ph(s) === want && s.length > best.length) best = s;
  }
  out[key] = best;
});
const keys = Object.keys(out).sort();
const file = path.join(ROOT, 'apps/mobile/test/l10n/longest_strings.json');
fs.writeFileSync(file, '{\n' + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(out[k])}`).join(',\n') + '\n}');
console.log(`${keys.length} keys -> ${path.relative(ROOT, file)}`);
