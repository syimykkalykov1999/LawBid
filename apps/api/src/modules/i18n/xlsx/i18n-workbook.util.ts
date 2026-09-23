import ExcelJS from 'exceljs';
import { ISO_639_1_PATTERN } from '../language-names';

/** One parsed translation row from an uploaded file, before any DB
 * comparison. `values` only has entries for language columns that had a
 * non-empty cell — a missing key means "no value in the file for that
 * language", not "empty string". */
export interface ParsedTranslationRow {
  key: string;
  values: Record<string, string>;
}

export interface ParsedWorkbook {
  languageCodes: string[];
  rows: ParsedTranslationRow[];
}

export interface ImportValidationError {
  row?: number;
  key?: string;
  lang?: string;
  message: string;
}

const PLACEHOLDER_PATTERN = /\{[a-zA-Z0-9_]+\}/g;

/**
 * docs/01_FOUNDATION_AUTH.md §9.2: the file is either .xlsx or CSV
 * (UTF-8). Sniffed by content (ZIP local-file-header magic `PK\x03\x04`
 * for xlsx), not by filename/mimetype — a client renaming a file or a
 * browser guessing the wrong Content-Type shouldn't change how this
 * parses; only the bytes matter.
 */
export async function parseTranslationsFile(
  buffer: Buffer,
): Promise<string[][]> {
  const isXlsx =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook();
    // exceljs's own type defs merge a conflicting global `declare
    // interface Buffer extends ArrayBuffer {}` (node_modules/exceljs/
    // index.d.ts) on top of @types/node's generic Buffer<T>, producing a
    // merged `Buffer` type that no real value (including a genuine Node
    // Buffer) can satisfy — `.slice()` would have to return both an
    // ArrayBuffer and a Uint8Array at once. A known exceljs typing
    // defect (not an actual runtime mismatch: load() genuinely wants,
    // and gets, a plain Node Buffer), so `any` is the only cast that
    // actually bypasses it — `as unknown as Buffer` still resolves
    // `Buffer` to the same broken merged type and fails the same way.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const grid: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      // ExcelJS rows/cols are 1-indexed and sparse — track the highest
      // populated column via eachCell's colNumber callback arg (Cell's
      // own `.col` is a column-LETTER string, not a number) so a
      // language column with no translation for this key (legitimately
      // blank, same as a trailing empty CSV field) doesn't get lost from
      // the middle of the row.
      let maxCol = 0;
      row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
        maxCol = Math.max(maxCol, colNumber);
      });
      const cells: string[] = [];
      for (let c = 1; c <= maxCol; c++) {
        cells.push(cellToString(row.getCell(c).value));
      }
      grid.push(cells);
    });
    return grid;
  }

  return parseCsv(buffer.toString('utf-8'));
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // Rich text / hyperlink cells: exceljs represents these as objects
    // ({richText: [...]} or {text, hyperlink}) rather than a plain
    // string — the translation format only ever needs plain text.
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((p) => p.text).join('');
    }
    return '';
  }
  return String(value);
}

/** Minimal RFC 4180 CSV parser: comma-delimited, double-quote-quoted
 * fields, `""` as an escaped quote inside a quoted field, `\r\n` or `\n`
 * row separators. No external dependency — the format §9.2 requires
 * (plain key/lang-code columns, no embedded newlines expected in a
 * translation *key*, though a translation *value* legitimately can
 * contain a comma or newline, which is exactly why this needs real
 * quote-handling rather than a naive `.split(',')`). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  // Strip a UTF-8 BOM if present (§9.2: "CSV UTF-8").
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    // Skip fully-empty trailing rows (e.g. a final blank line).
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/**
 * Turns a raw grid (header row + data rows, as returned by
 * parseTranslationsFile) into a validated ParsedWorkbook, applying every
 * check docs/01_FOUNDATION_AUTH.md §9.3 lists: "дубликаты ключей, пустые
 * значения для en (обязательный), несовпадение плейсхолдеров между
 * языками, неизвестные языки." Returns BOTH the parsed rows (for the
 * caller's diff-against-DB step) and the full error list — validation
 * errors don't stop parsing, so a dry-run report can list every problem
 * in one pass rather than one-at-a-time.
 */
export function buildParsedWorkbook(grid: string[][]): {
  workbook: ParsedWorkbook;
  errors: ImportValidationError[];
} {
  const errors: ImportValidationError[] = [];

  if (grid.length === 0) {
    return {
      workbook: { languageCodes: [], rows: [] },
      errors: [{ message: 'File is empty.' }],
    };
  }

  const header = grid[0].map((h) => h.trim());
  if (header[0]?.toLowerCase() !== 'key') {
    errors.push({
      row: 1,
      message: `First column must be "key" (got "${header[0] ?? ''}").`,
    });
  }

  const languageCodes: string[] = [];
  const seenLangCols = new Set<string>();
  for (let c = 1; c < header.length; c++) {
    const raw = header[c];
    const code = raw?.trim().toLowerCase() ?? '';
    if (code === '') continue; // trailing empty header cell — ignore, not an error
    if (!ISO_639_1_PATTERN.test(code)) {
      errors.push({
        row: 1,
        lang: raw,
        message: `Unknown language column "${raw}" — expected a 2-letter ISO 639-1 code.`,
      });
      continue;
    }
    if (seenLangCols.has(code)) {
      errors.push({
        row: 1,
        lang: code,
        message: `Duplicate language column "${code}".`,
      });
      continue;
    }
    seenLangCols.add(code);
    languageCodes.push(code);
  }
  if (!languageCodes.includes('en')) {
    errors.push({
      row: 1,
      message: '"en" is a required language column (§9.3: fallback language).',
    });
  }

  const rows: ParsedTranslationRow[] = [];
  const seenKeys = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const line = grid[r];
    const rowNumber = r + 1; // 1-indexed, header is row 1
    const key = line[0]?.trim() ?? '';
    if (key === '' && line.every((cell) => (cell ?? '').trim() === '')) {
      continue; // fully blank row — not an error, just skip it
    }
    if (key === '') {
      errors.push({ row: rowNumber, message: 'Empty key.' });
      continue;
    }
    if (seenKeys.has(key)) {
      errors.push({ row: rowNumber, key, message: `Duplicate key "${key}".` });
      continue;
    }
    seenKeys.add(key);

    const values: Record<string, string> = {};
    for (let c = 1; c < header.length; c++) {
      const code = header[c]?.trim().toLowerCase();
      if (!code || !languageCodes.includes(code)) continue;
      const value = (line[c] ?? '').trim();
      if (value !== '') values[code] = value;
    }

    const enValue = values['en'];
    if (!enValue) {
      errors.push({
        row: rowNumber,
        key,
        lang: 'en',
        message: `Empty "en" value for key "${key}" (en is required for every key).`,
      });
    } else {
      const enPlaceholders = extractPlaceholders(enValue);
      for (const [lang, value] of Object.entries(values)) {
        if (lang === 'en') continue;
        const langPlaceholders = extractPlaceholders(value);
        if (!sameSet(enPlaceholders, langPlaceholders)) {
          errors.push({
            row: rowNumber,
            key,
            lang,
            message:
              `Placeholder mismatch for key "${key}" in "${lang}": ` +
              `expected {${[...enPlaceholders].join(', ')}}, got {${[...langPlaceholders].join(', ')}}.`,
          });
        }
      }
    }

    rows.push({ key, values });
  }

  return { workbook: { languageCodes, rows }, errors };
}

function extractPlaceholders(value: string): Set<string> {
  const matches = value.match(PLACEHOLDER_PATTERN) ?? [];
  return new Set(matches);
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * The export direction (GET /admin/i18n/export, §9.3): builds an .xlsx
 * buffer from the current DB state, same column shape as the import
 * format (`key` + one column per active language, sorted by
 * i18n_languages.sort — matches §9.2's table exactly so an exported file
 * re-imports unchanged, which is the whole point of round-tripping
 * through Excel for translators).
 */
export async function buildTranslationsWorkbookBuffer(
  languageCodes: string[],
  rows: { key: string; values: Record<string, string> }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('translations');
  sheet.columns = [
    { header: 'key', key: 'key', width: 40 },
    ...languageCodes.map((code) => ({ header: code, key: code, width: 40 })),
  ];
  for (const row of rows) {
    sheet.addRow({ key: row.key, ...row.values });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
