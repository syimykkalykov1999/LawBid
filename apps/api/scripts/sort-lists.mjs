#!/usr/bin/env node
// Conflict-proof shared lists (WORKER_BUILD_RULES "параллельные волны без
// конфликтов"): hand-kept registries are stored SORTED, so two PRs that each
// add a row at "the end" add it at its alphabetical place and git merges
// them cleanly. Nobody sorts by hand: this script does.
//
//   npm run lists:sort            rewrite every registry into canonical order
//   npm run lists:sort -- --check exit 1 (and name the file) if one is not
//
// Run by lint-staged on commit for these files and by the unit test
// src/architecture/registries-sorted.spec.ts (so an unsorted list fails CI).
// The canonical form is JSON.stringify(value, null, 2) + "\n" with the
// ordering rules below; nothing else about the content changes.
//
// Registries (path relative to apps/api unless it starts with "../../"):
//   test/two-db-suites.json                     run, environmentOnly, knownLimitations
//   src/redis/redis-cluster-scan.allowlist.json array of {file,kind,reason}
//   src/sharding/cross-family-include.allowlist.json  object: keys + each array
//   src/architecture/admin-heavy-queries.baseline.json object: keys
//   ../../docs/dev/SWITCH_INVENTORY.md          table rows by setting key
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Plain code-unit order: the same on every machine (no locale). */
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const sortStrings = (arr) => [...arr].sort(cmp);
const byFields =
  (...fields) =>
  (a, b) => {
    for (const f of fields) {
      const c = cmp(String(a[f] ?? ''), String(b[f] ?? ''));
      if (c !== 0) return c;
    }
    return 0;
  };
const sortKeys = (obj, valueFn = (v) => v) =>
  Object.fromEntries(
    Object.keys(obj)
      .sort(cmp)
      .map((k) => [k, valueFn(obj[k])]),
  );

/** One entry per registry: `canon(parsedJson) -> canonical json value`. */
export const JSON_REGISTRIES = [
  {
    file: 'test/two-db-suites.json',
    canon: (d) => ({
      ...d,
      ...(Array.isArray(d.run) && { run: sortStrings(d.run) }),
      ...(Array.isArray(d.environmentOnly) && {
        environmentOnly: sortStrings(d.environmentOnly),
      }),
      ...(Array.isArray(d.knownLimitations) && {
        knownLimitations: [...d.knownLimitations].sort(
          byFields('spec', 'kind'),
        ),
      }),
    }),
  },
  {
    file: 'src/redis/redis-cluster-scan.allowlist.json',
    canon: (d) => [...d].sort(byFields('file', 'kind', 'reason')),
  },
  {
    file: 'src/sharding/cross-family-include.allowlist.json',
    canon: (d) => sortKeys(d, (v) => (Array.isArray(v) ? sortStrings(v) : v)),
  },
  {
    file: 'src/architecture/admin-heavy-queries.baseline.json',
    canon: (d) => sortKeys(d),
  },
];

/** Markdown table: consecutive rows that start with "| `key` |" are sorted by key. */
export const MD_REGISTRIES = [{ file: '../../docs/dev/SWITCH_INVENTORY.md' }];

const ROW = /^\| `([^`]+)` \|/;

export function canonMarkdownRows(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    if (!ROW.test(lines[i])) {
      out.push(lines[i++]);
      continue;
    }
    const block = [];
    while (i < lines.length && ROW.test(lines[i])) block.push(lines[i++]);
    block.sort((a, b) => cmp(a.match(ROW)[1], b.match(ROW)[1]));
    out.push(...block);
  }
  return out.join('\n');
}

export const canonJsonText = (value) => JSON.stringify(value, null, 2) + '\n';

/**
 * Walks every registry under `apiRoot` (default: apps/api). Missing files are
 * skipped (a branch that does not have them yet). Returns the list of files
 * that were NOT in canonical order; with `write` they are rewritten.
 */
export function sortLists({ apiRoot, write }) {
  const unsorted = [];
  for (const r of JSON_REGISTRIES) {
    const path = resolve(apiRoot, r.file);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const after = canonJsonText(r.canon(JSON.parse(before)));
    if (before !== after) {
      unsorted.push(r.file);
      if (write) writeFileSync(path, after);
    }
  }
  for (const r of MD_REGISTRIES) {
    const path = resolve(apiRoot, r.file);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const after = canonMarkdownRows(before);
    if (before !== after) {
      unsorted.push(r.file);
      if (write) writeFileSync(path, after);
    }
  }
  return unsorted;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const unsorted = sortLists({ apiRoot, write: !check });
  if (check && unsorted.length) {
    console.error(
      `Not in canonical order (run: npm run lists:sort --workspace apps/api):\n  ${unsorted.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(
    unsorted.length
      ? `lists:sort rewrote ${unsorted.length} file(s): ${unsorted.join(', ')}`
      : 'lists:sort: every registry is already in canonical order',
  );
}
