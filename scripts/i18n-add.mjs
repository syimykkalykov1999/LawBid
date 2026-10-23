// Adds or replaces keys in apps/api/prisma/seed/translations_seed.xlsx
// (owner 2026-10-18: "every new text in all the app languages at once").
// Usage: node scripts/i18n-add.mjs file.json [file2.json …]
// Each file: { "<key>": { "<lang>": "<text>", … }, … }. A key not in the
// workbook gets a new row; for an existing key only the given languages
// change. Rows stay sorted by key. Run scripts/i18n-audit.mjs afterwards.
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const XLSX = path.join(ROOT, 'apps/api/prisma/seed/translations_seed.xlsx');

// `--remove=key1,key2` drops those rows (keys the code no longer uses).
const remove = new Set(
  process.argv.filter((a) => a.startsWith('--remove=')).flatMap((a) => a.slice(9).split(',')),
);
const add = {};
for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  for (const [k, langs] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))) {
    add[k] = { ...(add[k] ?? {}), ...langs };
  }
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const ws = wb.worksheets[0];
const head = ws.getRow(1).values.slice(1).map(String);
const col = Object.fromEntries(head.map((l, i) => [l, i]));
const unknown = new Set();
const rows = [];
ws.eachRow((r, n) => {
  if (n === 1) return;
  const v = r.values.slice(1).map((x) =>
    x && typeof x === 'object' ? String(x.text ?? x.result ?? '') : x == null ? '' : String(x),
  );
  rows.push(v);
});
for (let i = rows.length - 1; i >= 0; i--) if (remove.has(rows[i][0])) rows.splice(i, 1);
const byKey = new Map(rows.map((r) => [r[0], r]));
let added = 0;
let changed = 0;
for (const [k, langs] of Object.entries(add)) {
  let row = byKey.get(k);
  if (!row) {
    row = [k, ...head.slice(1).map(() => '')];
    byKey.set(k, row);
    rows.push(row);
    added++;
  } else {
    changed++;
  }
  for (const [l, text] of Object.entries(langs)) {
    if (col[l] === undefined) unknown.add(l);
    else row[col[l]] = text;
  }
}
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const out = new ExcelJS.Workbook();
const sheet = out.addWorksheet(ws.name);
sheet.addRow(head);
for (const r of rows) sheet.addRow(r);
await out.xlsx.writeFile(XLSX);
console.log(`i18n-add: ${added} added, ${changed} updated, ${rows.length} keys`);
if (unknown.size) console.log(`unknown languages ignored: ${[...unknown].join(', ')}`);
