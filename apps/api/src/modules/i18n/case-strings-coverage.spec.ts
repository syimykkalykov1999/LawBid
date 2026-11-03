import { join } from 'node:path';
import { loadSeedGrid } from './xlsx/seed-translations.util';

// Owner 2026-10-13: the strings of the case screens live in the seed files
// (all languages); a fresh seed must give every language every key.
function read(dir: string): Map<string, Map<string, string>> {
  const [head, ...rows] = loadSeedGrid(dir);
  const out = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const m = new Map<string, string>();
    head.slice(1).forEach((lang, j) => {
      const cell = row[j + 1];
      if (cell.trim() !== '') m.set(lang, cell);
    });
    out.set(row[0], m);
  }
  return out;
}

describe('case screen strings', () => {
  it('the seed files have the case keys in every language', () => {
    const seed = read(
      join(__dirname, '..', '..', '..', 'prisma', 'seed', 'translations'),
    );
    const keys = [
      'cases.tab.tasks',
      'cases.tasks.forClient',
      'cases.compose.remind',
      'cases.facts.state',
      'invites.title',
      'mine.tab.activeCases',
    ];
    const langs = [
      'en',
      'ru',
      'ne',
      'ar',
      'zh',
      'he',
      'hi',
      'de',
      'ja',
      'ko',
      'th',
      'zh-tw',
      'es',
      'fr',
    ];
    for (const key of keys) {
      for (const lang of langs) {
        expect(seed.get(key)?.get(lang)).toBeTruthy();
      }
    }
  });
});
