import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildParsedWorkbook } from './i18n-workbook.util';
import {
  loadEarlierSeedValues,
  loadSeedGrid,
  seedTranslationsDir,
} from './seed-translations.util';

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

  describe('broken seed folder', () => {
    const make = (files: Record<string, string>): string => {
      const d = mkdtempSync(join(tmpdir(), 'seed-'));
      for (const [name, body] of Object.entries(files)) {
        writeFileSync(join(d, name), body);
      }
      return d;
    };

    it('names the file of a language that has no <lang>.json', () => {
      const d = make({
        '_meta.json': '{"languages":["en","ru"]}',
        'en.json': '{"a":"A"}',
      });
      expect(() => loadSeedGrid(d)).toThrow(/ru\.json is missing|ru\.json/);
    });

    it('names key and language of a non-string value', () => {
      const d = make({
        '_meta.json': '{"languages":["en"]}',
        'en.json': '{"a":5}',
      });
      expect(() => loadSeedGrid(d)).toThrow(/key "a" in en\.json.*string/);
    });
  });
});

describe('loadEarlierSeedValues (KNOWN_ERRORS 271)', () => {
  const make = (files: Record<string, string>): string => {
    const d = mkdtempSync(join(tmpdir(), 'seed-old-'));
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(d, name), body);
    }
    return d;
  };
  const current = [
    ['key', 'en', 'ru'],
    ['tasks.view.done', 'Completed', 'Завершённые'],
    ['tasks.view.mine', 'Mine', 'Мои'],
  ];

  it('keeps only earlier texts that differ from the current seed, for keys it still has', () => {
    const oldSeedDir = make({
      '_meta.json': '{"languages":["en","ru"]}',
      'en.json': '{"tasks.view.done":"Archive","tasks.view.mine":"Mine"}',
      'ru.json':
        '{"tasks.view.done":" Архив ","tasks.view.mine":"","tasks.gone":"Было"}',
    });
    const supersededFile = join(make({}), 'superseded.json');
    writeFileSync(
      supersededFile,
      JSON.stringify({
        values: {
          ru: { 'tasks.view.done': ['Архив', 'Готово'] },
          xx: { 'tasks.view.done': ['?'] },
        },
      }),
    );

    const { values, cells } = loadEarlierSeedValues(current, {
      oldSeedDir,
      supersededFile,
    });

    expect(cells).toBe(3);
    expect([...(values.get('en')?.get('tasks.view.done') ?? [])]).toEqual([
      'Archive',
    ]);
    // Trimmed like the importer trims; the same text twice counts once.
    expect([...(values.get('ru')?.get('tasks.view.done') ?? [])]).toEqual([
      'Архив',
      'Готово',
    ]);
    // Same as now (en Mine), empty (ru), removed key, unknown language: none.
    expect(values.get('en')?.has('tasks.view.mine')).toBe(false);
    expect(values.get('ru')?.has('tasks.view.mine')).toBe(false);
    expect(values.get('ru')?.has('tasks.gone')).toBe(false);
    expect(values.has('xx')).toBe(false);
  });

  it('with no sources returns nothing', () => {
    expect(loadEarlierSeedValues(current, {}).cells).toBe(0);
  });

  it('the committed known earlier texts file is valid and only lists real changes', () => {
    const dir = join(__dirname, '../../../../prisma/seed/translations');
    const supersededFile = join(dir, '..', 'translations-superseded.json');
    const grid = loadSeedGrid(dir);
    const raw = JSON.parse(readFileSync(supersededFile, 'utf8')) as {
      values: Record<string, Record<string, string[]>>;
    };
    const listed = Object.values(raw.values).reduce(
      (n, byKey) =>
        n + Object.values(byKey).reduce((m, list) => m + list.length, 0),
      0,
    );
    // Every listed text is still meaningful (key + language in the seed, not
    // equal to today's text): nothing in the file is dropped on loading.
    expect(loadEarlierSeedValues(grid, { supersededFile }).cells).toBe(listed);
    expect(raw.values.ru?.['tasks.view.done'] ?? []).toContain('Архив');
  });
});
