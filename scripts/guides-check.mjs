#!/usr/bin/env node
// Owner 2026-10-27 («Сегодня» as the owner's desk, item 3): every runbook the
// owner may have to follow (docs/runbooks/*.md with an `owner:` line, a
// «Шаги владельца» heading or «владельц…» in its title) must have a guide in
// apps/admin/content/guides (front-matter `runbook: <file>[, <file>]`) or a
// written reason to skip it. The mapping docs/runbooks/GUIDES_MAP.json is
// kept by THIS script (`--approve` rewrites it in one canonical order; a plain
// run only checks), so parallel PRs never hand-edit it.
//
//   node scripts/guides-check.mjs            # check (CI: admin-ci)
//   node scripts/guides-check.mjs --approve  # rewrite the map, keep skip reasons
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RUNBOOKS_DIR = path.join(ROOT, 'docs', 'runbooks');
export const GUIDES_DIR = path.join(ROOT, 'apps', 'admin', 'content', 'guides');
export const MAP_FILE = path.join(RUNBOOKS_DIR, 'GUIDES_MAP.json');

const OWNER_MARKERS = [/^owner:/m, /Шаги владельца/, /^#[^\n]*владельц/im];

/** A runbook the owner is expected to follow (not only an engineer). */
export function ownerMarked(text) {
  return OWNER_MARKERS.some((re) => re.test(text));
}

/** `runbook:` of a guide's front-matter → the runbook file names it covers. */
export function guideRunbooks(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return { id: '', runbooks: [] };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return {
    id: fields.id ?? '',
    runbooks: (fields.runbook ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function readRunbooks(dir = RUNBOOKS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => ({ file, owner: ownerMarked(readFileSync(path.join(dir, file), 'utf8')) }));
}

export function readGuides(dir = GUIDES_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const g = guideRunbooks(readFileSync(path.join(dir, f), 'utf8'));
      return { id: g.id || f.replace(/\.md$/, ''), runbooks: g.runbooks };
    });
}

export function readMap(file = MAP_FILE) {
  if (!existsSync(file)) return { runbooks: {} };
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return { runbooks: parsed.runbooks ?? {} };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure: the canonical map from what the code has now, plus the problems.
 *  - guides come from the guides' own `runbook:` lines (never typed by hand);
 *  - skip reasons are kept from the previous map while the runbook exists and
 *    no guide covers it;
 *  - an owner-marked runbook with neither is a problem; so is a map row for a
 *    runbook or a guide that no longer exists, or a guide naming an unknown
 *    runbook.
 */
export function planMap(runbooks, guides, prev) {
  const files = new Set(runbooks.map((r) => r.file));
  const byRunbook = new Map();
  const problems = [];
  for (const g of guides) {
    for (const rb of g.runbooks) {
      if (!files.has(rb)) problems.push(`guide «${g.id}» names a runbook that does not exist: ${rb}`);
      if (!byRunbook.has(rb)) byRunbook.set(rb, []);
      byRunbook.get(rb).push(g.id);
    }
  }
  const map = { runbooks: {} };
  for (const r of [...runbooks].sort((a, b) => cmp(a.file, b.file))) {
    const ids = (byRunbook.get(r.file) ?? []).sort(cmp);
    const old = prev.runbooks[r.file];
    if (ids.length > 0) {
      map.runbooks[r.file] = { owner: r.owner, guides: ids };
    } else if (old && typeof old.skip === 'string' && old.skip.trim()) {
      map.runbooks[r.file] = { owner: r.owner, skip: old.skip.trim() };
    } else if (r.owner) {
      problems.push(`owner runbook without a guide: docs/runbooks/${r.file} — write apps/admin/content/guides/<id>.md with «runbook: ${r.file}», or add {"skip": "<reason>"} to GUIDES_MAP.json`);
    }
  }
  for (const [file, row] of Object.entries(prev.runbooks)) {
    if (!files.has(file)) problems.push(`GUIDES_MAP.json names a runbook that does not exist: ${file}`);
    else if (row && Array.isArray(row.guides)) {
      const known = new Set(guides.map((g) => g.id));
      for (const id of row.guides) if (!known.has(id)) problems.push(`GUIDES_MAP.json: guide «${id}» (for ${file}) does not exist`);
    }
  }
  return { map, problems };
}

export function serialize(map) {
  return `${JSON.stringify(
    {
      $comment:
        'Kept by scripts/guides-check.mjs (--approve). guides = from each guide’s front-matter «runbook:»; skip = a written reason the owner needs no guide. Do not edit the guides lists by hand.',
      runbooks: map.runbooks,
    },
    null,
    2,
  )}\n`;
}

export function run(argv = process.argv.slice(2)) {
  const approve = argv.includes('--approve');
  const runbooks = readRunbooks();
  const guides = readGuides();
  const prev = readMap();
  const { map, problems } = planMap(runbooks, guides, prev);
  const want = serialize(map);
  const have = existsSync(MAP_FILE) ? readFileSync(MAP_FILE, 'utf8') : '';
  if (approve) {
    writeFileSync(MAP_FILE, want);
    console.log(`guides:check — wrote ${path.relative(ROOT, MAP_FILE)} (${Object.keys(map.runbooks).length} runbooks)`);
  } else if (want !== have) {
    problems.push(`${path.relative(ROOT, MAP_FILE)} is out of date: run «node scripts/guides-check.mjs --approve» and commit it`);
  }
  for (const p of problems) console.error(`✗ ${p}`);
  const owner = runbooks.filter((r) => r.owner).length;
  const covered = Object.values(map.runbooks).filter((r) => r.guides).length;
  const skipped = Object.values(map.runbooks).filter((r) => r.skip).length;
  console.log(`guides:check — ${runbooks.length} runbooks (${owner} owner-marked), ${covered} with a guide, ${skipped} skipped with a reason, ${problems.length} problems`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run());
}
