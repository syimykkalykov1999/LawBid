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
