// The built-in translations live as plain text: one JSON file per language in
// apps/api/prisma/seed/translations/<lang>.json ({ "<key>": "<text>" }, keys
// sorted, 2-space indent) plus _meta.json ({ "languages": [column order] }).
// Binary seeds are not kept in git (KNOWN_ERRORS #39). This module is the one
// reader/writer for scripts; the API has its own reader in
// apps/api/src/modules/i18n/xlsx/seed-translations.util.ts.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const SEED_DIR = path.join(ROOT, 'apps/api/prisma/seed/translations');
const META = '_meta.json';

/** -> { langs: ['en','ru',…], rows: [{ key, cells: { en: '…', ru: '' } }] } sorted by key. */
export function readSeed(dir = SEED_DIR) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, META), 'utf8'));
  const langs = meta.languages;
  const byLang = Object.fromEntries(
    langs.map((l) => [l, JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'))]),
  );
  const keys = [...new Set(langs.flatMap((l) => Object.keys(byLang[l])))].sort(cmp);
  const rows = keys.map((key) => ({
    key,
    cells: Object.fromEntries(langs.map((l) => [l, byLang[l][key] ?? ''])),
  }));
  return { langs, rows };
}

/** Writes the same shape back; empty cells are left out of the files. */
export function writeSeed({ langs, rows }, dir = SEED_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const keep = new Set([META, ...langs.map((l) => `${l}.json`)]);
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !keep.has(f)) fs.unlinkSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, META), json({ languages: langs }));
  for (const l of langs) {
    const obj = {};
    for (const r of [...rows].sort((a, b) => cmp(a.key, b.key))) {
      const v = r.cells[l];
      if (v !== undefined && v !== '') obj[r.key] = v;
    }
    fs.writeFileSync(path.join(dir, `${l}.json`), json(obj));
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const json = (o) => JSON.stringify(o, null, 2) + '\n';
