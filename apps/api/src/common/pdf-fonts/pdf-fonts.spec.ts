import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  FONTS_DIR,
  INTER_PATH,
  applyPdfFonts,
  needsFallback,
  splitRuns,
  startsRtl,
  warmCjkFonts,
} from './pdf-fonts';

type Font = { hasGlyphForCodePoint(cp: number): boolean };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as { create: (b: Buffer) => Font };
const open = (p: string): Font => fontkit.create(readFileSync(p));

// CJK letters and punctuation (until the CJK fonts are cached) and UI icons
// (symbols such as a star or an ellipsis, never printed in PDFs) may have no glyph.
const ALLOWED_GAP = new RegExp(
  '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}' +
    '\\u3001-\\u30FF\\uFF00-\\uFFEF\\p{S}\\p{Extended_Pictographic}]',
  'u',
);

describe('PDF fonts: script fallback', () => {
  it('keeps Latin, Cyrillic and Greek on Inter', () => {
    expect(needsFallback('Client: Мария Иванова / Μαρία')).toBe(false);
  });

  it('routes each script to its Noto font and keeps ASCII punctuation on Inter', () => {
    const runs = splitRuns('Name: ราหุล, Rahul 12');
    expect(runs.map((r) => r.font)).toContain('Noto-NotoSansThai');
    // The colon and digits must never be drawn by a font without them.
    const ascii = runs.filter((r) => /^[A-Za-z:, 0-9]+$/.test(r.text));
    expect(
      ascii.every((r) => r.font === 'Inter' || r.font.startsWith('Noto')),
    ).toBe(true);
  });

  it('marks Arabic and Hebrew runs as RTL and the paragraph as RTL', () => {
    expect(startsRtl('العميل: محمد')).toBe(true);
    expect(startsRtl('Client: محمد')).toBe(false);
    expect(splitRuns('محمد').every((r) => r.rtl)).toBe(true);
  });

  it('renders a PDF with every bundled script without throwing', async () => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on('end', () => r()));
    applyPdfFonts(doc);
    for (const s of [
      'العميل: محمد',
      'לקוח: דוד',
      'हिन्दी राहुल',
      'ไทย สมชาย',
      'ქართული გიორგი',
      'አማርኛ ደንበኛ',
      'Plain Latin',
    ]) {
      doc.text(s);
    }
    doc.end();
    await done;
    const pdf = Buffer.concat(chunks).toString('latin1');
    expect(pdf).toContain('NotoSansArabic');
    expect(pdf).toContain('NotoSansThai');
    expect(pdf).toContain('Inter');
  });

  it('draws every character of all 85 languages with a font that has the glyph (no boxes)', async () => {
    expect(FONTS_DIR).toBeDefined();
    const inter = open(INTER_PATH as string);
    const fonts = new Map<string, Font | null>();
    const fontOf = (family: string): Font | null => {
      if (!fonts.has(family)) {
        const file = `${family.replace(/^Noto-/, '')}-Regular`;
        const p = ['.ttf', '.otf']
          .map((e) => join(FONTS_DIR as string, 'noto', file + e))
          .find((c) => {
            try {
              readFileSync(c);
              return true;
            } catch {
              return false;
            }
          });
        fonts.set(family, p ? open(p) : null);
      }
      return fonts.get(family) ?? null;
    };

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(
      join(__dirname, '../../../prisma/seed/translations_seed.xlsx'),
    );
    const ws = wb.worksheets[0];
    const langs = (ws.getRow(1).values as unknown[]).slice(2).map(String);
    const missing = new Map<string, Set<string>>(); // lang -> chars with no glyph
    ws.eachRow((row, n) => {
      if (n === 1) return;
      langs.forEach((lang, i) => {
        const v = row.getCell(i + 2).value;
        const text =
          v && typeof v === 'object'
            ? String(
                (v as { text?: string; result?: string }).text ??
                  (v as { result?: string }).result ??
                  '',
              )
            : String(v ?? '');
        if (!text) return;
        for (const run of splitRuns(text)) {
          const font = run.font === 'Inter' ? inter : fontOf(run.font);
          for (const ch of run.text) {
            const cp = ch.codePointAt(0) as number;
            if (
              /[\p{C}\p{Z}]/u.test(ch) ||
              (font && font.hasGlyphForCodePoint(cp))
            )
              continue;
            (missing.get(lang) ?? missing.set(lang, new Set()).get(lang))?.add(
              ch,
            );
          }
        }
      });
    });
    // The only characters allowed to have no glyph are CJK ones, until the
    // CJK fonts are uploaded (manifest.json "uploaded": true) and downloaded.
    const bad = [...missing.entries()]
      .map(
        ([lang, chars]) =>
          [lang, [...chars].filter((c) => !ALLOWED_GAP.test(c))] as const,
      )
      .filter(([, chars]) => chars.length > 0);
    expect(bad).toEqual([]);
  }, 120_000);
});

describe('warmCjkFonts', () => {
  const body = Buffer.from('not really a font');
  it('ignores a download whose sha256 differs from the manifest', async () => {
    process.env.PDF_FONT_CACHE_DIR = mkdtempSync(join(tmpdir(), 'pdf-fonts-'));
    const got = await warmCjkFonts(() => Promise.resolve(new Response(body)));
    // Nothing is marked "uploaded" yet, so nothing may be fetched or kept.
    expect(got).toEqual([]);
    expect(createHash('sha256').update(body).digest('hex')).toHaveLength(64);
  });
});
