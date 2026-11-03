import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSeedGrid } from '../../modules/i18n/xlsx/seed-translations.util';
import PDFDocument from 'pdfkit';
import {
  type CjkEntry,
  FONTS_DIR,
  INTER_PATH,
  applyPdfFonts,
  needsFallback,
  splitRuns,
  layoutLine,
  wrapWords,
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

  it('lays out Arabic with UAX#9: paragraph RTL, digits and Latin keep LTR order', () => {
    const l = layoutLine('المبلغ: 1500 USD');
    expect(l.rtlParagraph).toBe(true);
    const text = l.fragments.map((f) => f.text).join('');
    // Visual order: the LTR tail comes first, the Arabic word last (rightmost).
    expect(text.startsWith('USD')).toBe(true);
    expect(text).toContain('1500');
    expect(l.fragments[l.fragments.length - 1].font).toBe(
      'Noto-NotoSansArabic',
    );
    expect(layoutLine('Client: محمد').rtlParagraph).toBe(false);
  });

  it('places RTL and mixed-script lines for every alignment and keeps the next line at the margin', async () => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on('end', () => r()));
    applyPdfFonts(doc, { lang: 'ar' });
    const margin = doc.x;
    const xs: number[] = [];
    for (const align of ['left', 'center', 'right', 'justify'] as const) {
      doc.text('المبلغ: 1500 USD', { align });
      xs.push(doc.x);
    }
    doc.text('ไทย สมชาย', { align: 'center' });
    xs.push(doc.x);
    doc.end();
    await done;
    expect(xs.every((x) => x === margin)).toBe(true);
    expect(Buffer.concat(chunks).length).toBeGreaterThan(1000);
  });

  it('wraps a long mixed RTL paragraph at spaces, keeping direction and the margin', async () => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on('end', () => r()));
    applyPdfFonts(doc);
    const margin = doc.x;
    const one = doc.y;
    doc.text('المبلغ');
    const lineHeight = doc.y - one;
    const startY = doc.y;
    const long = Array.from(
      { length: 40 },
      () => 'المبلغ المستحق USD 1500',
    ).join(' ');
    doc.text(long, { align: 'right' });
    expect(doc.y - startY).toBeGreaterThan(lineHeight * 3);
    expect(doc.x).toBe(margin);
    doc.end();
    await done;
  });

  it('wrapWords breaks at spaces by measured width and keeps a too-wide word whole', () => {
    const w = (t: string) => t.length;
    expect(wrapWords('aa bb cc dd', 5, w)).toEqual(['aa bb', 'cc dd']);
    expect(wrapWords('abcdefgh ij', 4, w)).toEqual(['abcdefgh', 'ij']);
    expect(wrapWords('', 4, w)).toEqual([]);
  });

  it('keeps the paragraph direction when a wrapped line has no RTL letters', () => {
    const l = layoutLine('USD 1500', undefined, true);
    expect(l.rtlParagraph).toBe(true);
  });

  it('picks the Han font by document locale', () => {
    const font = (t: string, lang?: string) => splitRuns(t, lang)[0].font;
    expect(font('漢字', 'ja')).toBe('Noto-NotoSansCJKjp');
    expect(font('漢字', 'ko')).toBe('Noto-NotoSansCJKkr');
    expect(font('漢字', 'zh')).toBe('Noto-NotoSansCJKsc');
    expect(font('漢字')).toBe('Noto-NotoSansCJKsc');
    expect(font('かな漢字')).toBe('Noto-NotoSansCJKjp');
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

  it('draws every character of all 85 languages with a font that has the glyph (no boxes)', () => {
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

    const grid = loadSeedGrid(
      join(__dirname, '../../../prisma/seed/translations'),
    );
    const langs = grid[0].slice(1);
    const missing = new Map<string, Set<string>>(); // lang -> chars with no glyph
    grid.slice(1).forEach((row) => {
      langs.forEach((lang, i) => {
        const text = row[i + 1];
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
  const body = Buffer.from('pretend this is a 16 MB font');
  const entry = (sha256: string, uploaded = true): CjkEntry => ({
    sha256,
    cdn: 'https://cdn.example.test/NotoSansCJKjp-Regular.otf',
    uploaded,
  });
  const sha = createHash('sha256').update(body).digest('hex');
  beforeEach(() => {
    process.env.PDF_FONT_CACHE_DIR = mkdtempSync(join(tmpdir(), 'pdf-fonts-'));
  });
  afterEach(() => {
    delete process.env.PDF_FONT_CACHE_DIR;
  });

  it('caches a download whose sha256 matches the manifest', async () => {
    const fetchFn = jest.fn(() => Promise.resolve(new Response(body)));
    const got = await warmCjkFonts(fetchFn, {
      cjk: { 'NotoSansCJKjp-Regular.otf': entry(sha) },
    });
    expect(got).toEqual(['NotoSansCJKjp-Regular.otf']);
    expect(
      readFileSync(
        join(
          process.env.PDF_FONT_CACHE_DIR as string,
          'NotoSansCJKjp-Regular.otf',
        ),
      ),
    ).toEqual(body);
    // A second warm-up finds it on disk and does not download again.
    await warmCjkFonts(fetchFn, {
      cjk: { 'NotoSansCJKjp-Regular.otf': entry(sha) },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a download whose sha256 differs and keeps nothing on disk', async () => {
    const got = await warmCjkFonts(() => Promise.resolve(new Response(body)), {
      cjk: { 'NotoSansCJKjp-Regular.otf': entry('0'.repeat(64)) },
    });
    expect(got).toEqual([]);
    expect(
      existsSync(
        join(
          process.env.PDF_FONT_CACHE_DIR as string,
          'NotoSansCJKjp-Regular.otf',
        ),
      ),
    ).toBe(false);
  });

  it('skips entries not marked uploaded', async () => {
    const fetchFn = jest.fn();
    await warmCjkFonts(fetchFn, {
      cjk: { 'NotoSansCJKjp-Regular.otf': entry(sha, false) },
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
