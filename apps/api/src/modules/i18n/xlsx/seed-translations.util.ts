import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The built-in translations are plain text in git (KNOWN_ERRORS #39): one
 * `<lang>.json` per language ({ "<key>": "<text>" }) plus `_meta.json`
 * ({ "languages": [...] }, the column order). This turns that folder into
 * the same grid (header row + data rows) the xlsx/CSV parser returns, so
 * the validation and the DB diff stay exactly as they were.
 */
export function loadSeedGrid(dir: string): string[][] {
  const meta = JSON.parse(readFileSync(join(dir, '_meta.json'), 'utf8')) as {
    languages: string[];
  };
  const byLang = meta.languages.map((lang) => {
    const file = join(dir, `${lang}.json`);
    if (!existsSync(file)) {
      throw new Error(
        `Translations seed: language "${lang}" is listed in _meta.json but ${file} is missing.`,
      );
    }
    const texts = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      unknown
    >;
    for (const [key, value] of Object.entries(texts)) {
      if (typeof value !== 'string') {
        throw new Error(
          `Translations seed: key "${key}" in ${lang}.json must be a string, got ${typeof value}.`,
        );
      }
    }
    return texts as Record<string, string>;
  });
  const keys = [...new Set(byLang.flatMap((o) => Object.keys(o)))].sort();
  return [
    ['key', ...meta.languages],
    ...keys.map((key) => [key, ...byLang.map((o) => o[key] ?? '')]),
  ];
}

/** Where the folder is, from the API root, the repo root, or dist/src. */
export function seedTranslationsDir(): string | null {
  const candidates = [
    join(process.cwd(), 'prisma/seed/translations'),
    join(process.cwd(), 'apps/api/prisma/seed/translations'),
    join(__dirname, '../../../../prisma/seed/translations'),
    join(__dirname, '../../../../../prisma/seed/translations'),
  ];
  return candidates.find((p) => existsSync(join(p, '_meta.json'))) ?? null;
}

/** lang → key → earlier built-in texts (the import service's
 * PreviousSeedValues shape; kept here so this file needs no Nest imports). */
export type EarlierSeedValues = Map<string, Map<string, Set<string>>>;

/**
 * KNOWN_ERRORS 271: the release import used to only ADD missing texts, so a
 * text changed in the seed (tasks.view.done «Архив» → «Завершённые», PR #1370)
 * never reached the database. Like Crowdin / Lokalise / Phrase "update only
 * untouched", the importer needs the EARLIER seed texts: a database cell that
 * still holds one was never edited and may take the new text.
 *
 * Sources (both optional):
 * - `oldSeedDir`: the running release's prisma/seed/translations (the deploy
 *   copies it out of the running image, scripts/deploy/prod-admin-ecs.sh i18n);
 * - `supersededFile`: prisma/seed/translations-superseded.json, the earlier
 *   seed texts of releases deployed before this mechanism existed (made from
 *   the repository history by scripts/i18n-seed-superseded.mjs).
 *
 * Only texts that differ from the current seed (`currentGrid`, loadSeedGrid's
 * shape) and are not empty are kept, so memory stays small (the old folder is
 * read one language at a time).
 */
export function loadEarlierSeedValues(
  currentGrid: string[][],
  sources: { oldSeedDir?: string; supersededFile?: string },
): { values: EarlierSeedValues; cells: number } {
  const [header = [], ...rows] = currentGrid;
  const col = new Map(header.slice(1).map((lang, i) => [lang, i + 1]));
  const rowByKey = new Map(rows.map((r) => [r[0] ?? '', r]));
  const values: EarlierSeedValues = new Map();
  let cells = 0;
  const add = (lang: string, key: string, raw: unknown): void => {
    // Trimmed like buildParsedWorkbook trims every imported cell.
    const earlier = typeof raw === 'string' ? raw.trim() : '';
    if (earlier === '') return;
    const c = col.get(lang);
    const row = rowByKey.get(key);
    // A key or language the current seed no longer has is not imported.
    if (c === undefined || row === undefined) return;
    if ((row[c] ?? '').trim() === earlier) return;
    let byKey = values.get(lang);
    if (!byKey) {
      byKey = new Map();
      values.set(lang, byKey);
    }
    let set = byKey.get(key);
    if (!set) {
      set = new Set();
      byKey.set(key, set);
    }
    if (!set.has(earlier)) {
      set.add(earlier);
      cells += 1;
    }
  };

  if (sources.oldSeedDir) {
    const meta = JSON.parse(
      readFileSync(join(sources.oldSeedDir, '_meta.json'), 'utf8'),
    ) as { languages: string[] };
    for (const lang of meta.languages) {
      const file = join(sources.oldSeedDir, `${lang}.json`);
      if (!existsSync(file)) continue;
      const texts = JSON.parse(readFileSync(file, 'utf8')) as Record<
        string,
        unknown
      >;
      for (const [key, earlier] of Object.entries(texts)) {
        add(lang, key, earlier);
      }
    }
  }
  if (sources.supersededFile) {
    const file = JSON.parse(readFileSync(sources.supersededFile, 'utf8')) as {
      values?: Record<string, Record<string, unknown>>;
    };
    for (const [lang, byKey] of Object.entries(file.values ?? {})) {
      for (const [key, list] of Object.entries(byKey)) {
        for (const earlier of Array.isArray(list) ? list : []) {
          add(lang, key, earlier);
        }
      }
    }
  }
  return { values, cells };
}
