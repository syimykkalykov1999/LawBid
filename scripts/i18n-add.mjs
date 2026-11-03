// Adds or replaces keys in apps/api/prisma/seed/translations/<lang>.json
// (owner 2026-10-18: "every new text in all the app languages at once").
// Usage: node scripts/i18n-add.mjs file.json [file2.json …]
// Each file: { "<key>": { "<lang>": "<text>", … }, … }. A key not in the
// seed gets a new row; for an existing key only the given languages
// change. Keys stay sorted. Run scripts/i18n-audit.mjs afterwards.
import fs from 'node:fs';
import { readSeed, writeSeed } from './lib/translations-seed.mjs';

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

const seed = readSeed();
const { langs } = seed;
const rows = seed.rows.filter((r) => !remove.has(r.key));
const byKey = new Map(rows.map((r) => [r.key, r]));
const unknown = new Set();
let added = 0;
let changed = 0;
for (const [k, texts] of Object.entries(add)) {
  let row = byKey.get(k);
  if (!row) {
    row = { key: k, cells: Object.fromEntries(langs.map((l) => [l, ''])) };
    byKey.set(k, row);
    rows.push(row);
    added++;
  } else {
    changed++;
  }
  for (const [l, text] of Object.entries(texts)) {
    if (!langs.includes(l)) unknown.add(l);
    else row.cells[l] = text;
  }
}
writeSeed({ langs, rows });
console.log(`i18n-add: ${added} added, ${changed} updated, ${rows.length} keys`);
if (unknown.size) console.log(`unknown languages ignored: ${[...unknown].join(', ')}`);
