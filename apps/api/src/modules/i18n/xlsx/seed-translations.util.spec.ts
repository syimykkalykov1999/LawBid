import { join } from 'node:path';
import { buildParsedWorkbook } from './i18n-workbook.util';
import { loadSeedGrid, seedTranslationsDir } from './seed-translations.util';

// Numbers recorded from translations_seed.xlsx (13.6 MB, the last binary
// seed) on 2026-11-03, the moment it was converted to per-language JSON:
// 6368 keys x 85 languages, 541280 non-empty cells, no duplicate keys.
// Adding texts raises these; losing any of them must fail this test.
const FROM_XLSX = { keys: 6368, languages: 85, cells: 541280 };

describe('translations seed (per-language JSON)', () => {
  const dir = join(__dirname, '../../../../prisma/seed/translations');
  const grid = loadSeedGrid(dir);
  const { workbook, errors } = buildParsedWorkbook(grid);

  it('is found from the API root', () => {
    expect(seedTranslationsDir()).not.toBeNull();
  });

  it('passes the same validation as an admin upload', () => {
    expect(errors).toEqual([]);
  });

  it('has at least the keys, languages and cells the xlsx had', () => {
    const cells = workbook.rows.reduce(
      (n, r) => n + Object.keys(r.values).length,
      0,
    );
    expect(workbook.languageCodes.length).toBeGreaterThanOrEqual(
      FROM_XLSX.languages,
    );
    expect(workbook.rows.length).toBeGreaterThanOrEqual(FROM_XLSX.keys);
    expect(cells).toBeGreaterThanOrEqual(FROM_XLSX.cells);
  });

  it('keeps English first-class and rows sorted by key', () => {
    expect(workbook.languageCodes).toContain('en');
    const keys = workbook.rows.map((r) => r.key);
    expect(keys).toEqual([...keys].sort());
  });
});
