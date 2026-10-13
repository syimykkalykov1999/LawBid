import { join } from 'node:path';
import ExcelJS from 'exceljs';

// Owner 2026-10-13: the strings of the case screens live in the seed file
// (en + ru) and in tmp-import/cases-*.xlsx (all languages); a fresh seed
// plus those imports must give every language every key.
async function read(file: string): Promise<Map<string, Map<string, string>>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const head = (ws.getRow(1).values as string[]).slice(1).map(String);
  const out = new Map<string, Map<string, string>>();
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const v = (row.values as (string | number | null | undefined)[]).slice(1);
    const m = new Map<string, string>();
    head.slice(1).forEach((lang, j) => {
      const cell = v[j + 1];
      if (typeof cell === 'string' && cell.trim() !== '') m.set(lang, cell);
    });
    out.set(String(v[0] ?? ''), m);
  });
  return out;
}

describe('case screen strings', () => {
  it('the seed file has the case keys in every language', async () => {
    const seed = await read(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'prisma',
        'seed',
        'translations_seed.xlsx',
      ),
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
  }, 60_000);
});
