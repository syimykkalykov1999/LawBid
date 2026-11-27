// KNOWN_ERRORS 271 (27.11): the release import only ADDED missing texts, so a
// text changed in the seed never reached the database (tasks.view.done stayed
// «Архив» on prod after PR #1370 made it «Завершённые»). From now on the
// deploy hands the importer the running release's seed ("update only
// untouched": a cell still holding an earlier seed text takes the new one).
// The releases deployed BEFORE that left older seed texts in the database:
// this script collects them from the repository history into
// apps/api/prisma/seed/translations-superseded.json, which the importer reads
// next to the seed folder (apps/api/src/cli/import-translations.ts).
//
//   node scripts/i18n-seed-superseded.mjs <file with one commit per line>
//
// The commits are the releases that went to prod (deploy.yml runs), e.g.
//   gh run list --workflow deploy.yml --limit 1000 \
//     --json headSha,conclusion --jq '.[] | select(.conclusion=="success" or .conclusion=="failure") | .headSha'
// Each commit's seed is read: the per-language JSON (since 03.11) or the old
// translations_seed.xlsx (before). Kept per language and key: the earlier
// texts (trimmed, non-empty) that differ from the CURRENT seed, for keys and
// languages the current seed still has. Only rows equal to one of them are
// ever updated, so an extra commit in the list can never touch an edited text.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED = 'apps/api/prisma/seed/translations';
const XLSX = 'apps/api/prisma/seed/translations_seed.xlsx';
const OUT = path.join(ROOT, 'apps/api/prisma/seed/translations-superseded.json');
const require = createRequire(path.join(ROOT, 'apps/api/package.json'));

const listFile = process.argv[2];
if (!listFile) {
  console.error('usage: node scripts/i18n-seed-superseded.mjs <commits file>');
  process.exit(2);
}
const commits = [...new Set(fs.readFileSync(listFile, 'utf8').split(/\s+/).filter(Boolean))];
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 30, ...opts });

// Current seed: lang → key → trimmed text.
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, SEED, '_meta.json'), 'utf8'));
const current = new Map();
for (const lang of meta.languages) {
  const texts = JSON.parse(fs.readFileSync(path.join(ROOT, SEED, `${lang}.json`), 'utf8'));
  current.set(lang, new Map(Object.entries(texts).map(([k, v]) => [k, String(v).trim()])));
}

const out = new Map(); // lang → key → Set
let cells = 0;
const add = (lang, key, raw) => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const now = current.get(lang)?.get(key);
  if (text === '' || now === undefined || now === text) return;
  if (!out.has(lang)) out.set(lang, new Map());
  const byKey = out.get(lang);
  if (!byKey.has(key)) byKey.set(key, new Set());
  if (!byKey.get(key).has(text)) {
    byKey.get(key).add(text);
    cells += 1;
  }
};

const seenBlobs = new Set();
const blobOf = (commit, p) => {
  try {
    return git(['rev-parse', '-q', '--verify', `${commit}:${p}`], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

let ExcelJS = null;
const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('');
    return '';
  }
  return String(v);
};

let jsonVersions = 0;
let xlsxVersions = 0;
for (const commit of commits) {
  if (blobOf(commit, `${SEED}/_meta.json`)) {
    const tree = git(['ls-tree', commit, `${SEED}/`]).toString().trim().split('\n');
    for (const line of tree) {
      const m = line.match(/^\d+ blob ([0-9a-f]+)\t.*\/([^/]+)\.json$/);
      if (!m || m[2] === '_meta' || seenBlobs.has(m[1])) continue;
      seenBlobs.add(m[1]);
      jsonVersions += 1;
      const texts = JSON.parse(git(['cat-file', 'blob', m[1]]).toString('utf8'));
      for (const [key, value] of Object.entries(texts)) add(m[2], key, value);
    }
    continue;
  }
  const blob = blobOf(commit, XLSX);
  if (!blob || seenBlobs.has(blob)) continue;
  seenBlobs.add(blob);
  xlsxVersions += 1;
  ExcelJS ??= require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(git(['cat-file', 'blob', blob]));
  const sheet = wb.worksheets[0];
  let header = null;
  sheet?.eachRow({ includeEmpty: false }, (row) => {
    const cellsOfRow = [];
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      cellsOfRow[col - 1] = cellText(cell.value);
    });
    if (!header) {
      header = cellsOfRow.map((h) => (h ?? '').trim().toLowerCase());
      return;
    }
    const key = (cellsOfRow[0] ?? '').trim();
    if (key === '') return;
    for (let c = 1; c < header.length; c++) add(header[c], key, cellsOfRow[c]);
  });
  console.error(`xlsx ${commit.slice(0, 9)}: read`);
}

const values = {};
for (const lang of [...out.keys()].sort()) {
  values[lang] = {};
  for (const key of [...out.get(lang).keys()].sort()) {
    values[lang][key] = [...out.get(lang).get(key)].sort();
  }
}
fs.writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      about:
        'Earlier built-in texts of releases deployed before 27.11 (KNOWN_ERRORS 271). A database cell equal to one of them was never edited and takes the current seed text on the next release. Made by scripts/i18n-seed-superseded.mjs.',
      values,
    },
    null,
    1,
  )}\n`,
);
console.log(
  `commits ${commits.length}, seed versions read: json files ${jsonVersions}, xlsx ${xlsxVersions}; earlier texts kept: ${cells} cells in ${out.size} languages -> ${path.relative(ROOT, OUT)}`,
);
