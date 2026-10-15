// Translation audit (owner 2026-10-15: "check every translation, all of it").
// Reads apps/api/prisma/seed/translations_seed.xlsx and the keys the code asks
// for, and reports per language: empty cells, text identical to English that
// should not be (non-brand), Latin text in a non-Latin language (untranslated),
// placeholder mismatches ({name}), and keys used in code but missing from the
// workbook. `--ci` fails on empty cells, placeholder mismatches and missing
// keys; "same as English" is a warning unless the language is listed in
// scripts/i18n-audit.allow.json (words that are legitimately the same).
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const XLSX = path.join(ROOT, 'apps/api/prisma/seed/translations_seed.xlsx');
const ALLOW = path.join(ROOT, 'scripts/i18n-audit.allow.json');
const ci = process.argv.includes('--ci');
const json = process.argv.includes('--json');

const allow = fs.existsSync(ALLOW)
  ? JSON.parse(fs.readFileSync(ALLOW, 'utf8'))
  : { sameAsEnglishKeys: [], sameAsEnglishPrefixes: [], perLanguage: {} };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.worksheets[0];
const head = ws.getRow(1).values;
const langs = head.slice(2);
const rows = [];
ws.eachRow((r, n) => {
  if (n === 1) return;
  const v = r.values;
  const cell = (c) => {
    const x = v[c];
    if (x && typeof x === 'object') return String(x.text ?? x.result ?? '');
    return x == null ? '' : String(x);
  };
  rows.push({ key: cell(1), cells: Object.fromEntries(langs.map((l, i) => [l, cell(i + 2)])) });
});

const NON_LATIN = new Set(['ru','uk','bg','sr','be','mk','mn','kk','ky','tg','el','hy','ka','he','ar','fa','ur','ps','ku','hi','bn','ta','te','mr','gu','kn','ml','pa','ne','th','lo','km','my','si','am','zh','zh-tw','ja','ko']);
const placeholders = (s) => [...s.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]).sort().join(',');
const hasLetters = (s) => /\p{L}/u.test(s);
const onlyLatin = (s) => hasLetters(s) && !/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(s);
const brandish = (s) => !/\p{L}{3,}/u.test(s.replace(/\{[^}]+\}/g, '')) || /^(LawBid|DMCA|SMS|OK|ID|PDF|URL|FAQ)\b/i.test(s);

const report = { empty: [], placeholder: [], sameAsEnglish: {}, latinInNonLatin: {}, missingInCode: [], hardcoded: [] };
for (const r of rows) {
  const en = r.cells.en;
  for (const l of langs) {
    const t = r.cells[l];
    if (t.trim() === '') { report.empty.push([r.key, l]); continue; }
    if (en && placeholders(t) !== placeholders(en)) report.placeholder.push([r.key, l]);
    if (l === 'en') continue;
    const okSame = allow.sameAsEnglishKeys.includes(r.key) || allow.sameAsEnglishPrefixes.some((p) => r.key.startsWith(p)) || (allow.perLanguage[l] ?? []).includes(r.key);
    if (t === en && !okSame && !brandish(en)) (report.sameAsEnglish[l] ??= []).push(r.key);
    if (NON_LATIN.has(l) && onlyLatin(t) && !onlyLatin('') && !okSame && !brandish(t) && t !== en) (report.latinInNonLatin[l] ??= []).push(r.key);
    if (NON_LATIN.has(l) && onlyLatin(t) && t === en && !okSame && !brandish(en)) (report.latinInNonLatin[l] ??= []).push(r.key);
  }
}

// Keys the code asks for, and strings written into widgets.
const have = new Set(rows.map((r) => r.key));
const usedKeys = new Set();
function walk(dir, exts, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.dart_tool', 'build', 'generated', '.git', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, fn);
    else if (exts.some((x) => e.name.endsWith(x)) && !/\.g\.dart$|_test\.dart$|\.spec\.ts$/.test(e.name)) fn(p);
  }
}
walk(path.join(ROOT, 'apps/mobile/lib'), ['.dart'], (p) => {
  const s = fs.readFileSync(p, 'utf8');
  for (const m of s.matchAll(/\bt\.(?:t|plural)\(\s*'([a-zA-Z0-9_.]+)'/g)) usedKeys.add(m[1]);
  if (/presentation\//.test(p)) {
    s.split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      const m = line.match(/\b(?:Text|SnackBar|AppButton)\(\s*(?:label:\s*)?'([^'$]{3,})'/);
      if (m && /\p{L}{3,}/u.test(m[1]) && !/assets\/|\.dart|http|\\n/.test(m[1])) report.hardcoded.push(`${path.relative(ROOT, p)}:${i + 1}: ${m[1]}`);
    });
  }
});
// Keys built from a prefix (t.t('post.menu.${x}')) are skipped.
for (const k of usedKeys) if (!have.has(k) && !have.has(k + '.other') && !/^(topic|practice|state|time)\./.test(k)) report.missingInCode.push(k);

const summary = {
  languages: langs.length,
  keys: rows.length,
  emptyCells: report.empty.length,
  placeholderMismatches: report.placeholder.length,
  sameAsEnglish: Object.fromEntries(Object.entries(report.sameAsEnglish).map(([l, k]) => [l, k.length])),
  latinInNonLatin: Object.fromEntries(Object.entries(report.latinInNonLatin).map(([l, k]) => [l, new Set(k).size])),
  keysUsedButMissing: report.missingInCode.length,
  hardcodedStrings: report.hardcoded.length,
};
if (json) console.log(JSON.stringify({ summary, report }, null, 1));
else {
  console.log(JSON.stringify(summary, null, 1));
  const show = (title, list) => list.length && console.log(`\n${title} (${list.length}):\n  ` + list.slice(0, 25).map((x) => (Array.isArray(x) ? x.join(' / ') : x)).join('\n  '));
  show('empty cells', report.empty);
  show('placeholder mismatches', report.placeholder);
  show('keys used in code but missing from the workbook', report.missingInCode);
  show('strings written into widgets (not translated)', report.hardcoded);
}
if (ci && (report.empty.length || report.placeholder.length || report.missingInCode.length)) process.exit(1);
