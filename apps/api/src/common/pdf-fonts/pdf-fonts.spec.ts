import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSeedGrid } from '../../modules/i18n/xlsx/seed-translations.util';
import PDFDocument from 'pdfkit';
import {
  type CjkEntry,
  FONTS_DIR,
  cjkCacheDir,
  INTER_PATH,
  PdfWordCache,
  applyPdfFonts,
  parsedFont,
  type PdfLayoutCache,
  needsFallback,
  splitRuns,
  layoutLine,
  wrapWords,
  warmCjkFonts,
} from './pdf-fonts';

type Font = { hasGlyphForCodePoint(cp: number): boolean };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit') as { create: (b: Buffer) => Font };
/** A font whose glyph answers are remembered per code point (the 85-language
 * check asks for every character of the seed: ~20 M lookups). */
const open = (p: string): Font => {
  const font = fontkit.create(readFileSync(p));
  const known = new Map<number, boolean>();
  return {
    hasGlyphForCodePoint: (cp) => {
      let has = known.get(cp);
      if (has === undefined) {
        has = font.hasGlyphForCodePoint(cp);
        known.set(cp, has);
      }
      return has;
    },
  };
};

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
        // The CJK files are not in git: they live in the download cache
        // (KNOWN_ERRORS 221 — a Mac with the cache warm failed here).
        const p = ['.ttf', '.otf']
          .flatMap((e) => [
            join(FONTS_DIR as string, 'noto', file + e),
            join(cjkCacheDir(), file + e),
          ])
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

describe('PdfWordCache (row 145: shaped words kept between PDFs)', () => {
  it('keeps at most maxWords IN ALL (every font together), the least recently used goes first', () => {
    const cache = new PdfWordCache(3);
    const fontA = {};
    const fontB = {};
    const a = cache.get(fontA);
    const b = cache.get(fontB);
    a['one '] = 1;
    a['two '] = 2;
    expect(a['one ']).toBe(1); // used: «two» is now the oldest
    b['one '] = 'b'; // same word, other font: its own entry
    expect(cache.size).toBe(3);
    b['two '] = 'b2'; // a 4th word anywhere drops the oldest of ALL fonts
    expect(cache.size).toBe(3);
    expect(a['two ']).toBeUndefined();
    expect(a['one ']).toBe(1);
    expect(b['one ']).toBe('b');
    expect(b['two ']).toBe('b2');
    expect(cache.sizeFor(fontA) + cache.sizeFor(fontB)).toBe(3);
    expect(cache.get(fontA)).toBe(a);
    // A lower bound applies at the next new word.
    cache.maxWords = 1;
    a['four'] = 4;
    expect(cache.size).toBe(1);
    expect(a['four']).toBe(4);
  });

  it('never holds more than maxWords, however many fonts and words pass through', () => {
    const cache = new PdfWordCache(500);
    const fonts = Array.from({ length: 25 }, () => ({}));
    let max = 0;
    for (let i = 0; i < 20_000; i++) {
      const store = cache.get(fonts[i % fonts.length]);
      store[`w${i} `] = i;
      max = Math.max(max, cache.size);
    }
    expect(max).toBe(500);
    expect(cache.size).toBe(500);
  });

  it('0 = nothing kept: each render gets its own fresh cache and the kept words are dropped', () => {
    const cache = new PdfWordCache(10);
    cache.get({})['x'] = 1;
    expect(cache.forRender()).toBe(cache);
    cache.maxWords = 0;
    const r1 = cache.forRender();
    const r2 = cache.forRender();
    expect(r1).not.toBe(cache);
    expect(r1).not.toBe(r2);
    const font = {};
    expect(r1.get(font)).toBeUndefined();
    expect(cache.sizeFor(font)).toBe(0);
  });

  it('a PDF in every script is byte for byte the same with words kept from an earlier PDF', async () => {
    const render = async (layoutCache?: PdfLayoutCache): Promise<string> => {
      const doc = new PDFDocument({
        size: 'A4',
        info: { CreationDate: new Date('2026-11-14T00:00:00Z') },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      const done = new Promise((r) => doc.on('end', r));
      applyPdfFonts(doc, layoutCache ? { layoutCache } : {});
      for (const t of [
        'Client: Мария Иванова, fee $2,400 — agreed.',
        'العميل: محمد 1500 دولار',
        'ลูกค้า ราหุล ค่าธรรมเนียม',
        'שלום עולם 12',
        'राहुल शर्मा — शुल्क',
      ]) {
        doc.text(t, { width: 300, align: 'justify' });
        doc.text(t, { align: 'right', wordSpacing: 2 });
      }
      doc.end();
      await done;
      return createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
    };
    const plain = await render();
    expect(await render()).toBe(plain);
    const kept = new PdfWordCache(5000);
    expect(await render(kept.forRender())).toBe(plain);
    expect(await render(kept.forRender())).toBe(plain); // all words from the cache
    expect(kept.sizeFor(parsedFont(INTER_PATH as string))).toBeGreaterThan(10);
    // A bound far below the words of one PDF (constant eviction across the
    // scripts' fonts mid-render) still gives the same bytes.
    const tiny = new PdfWordCache(7);
    expect(await render(tiny.forRender())).toBe(plain);
    expect(await render(tiny.forRender())).toBe(plain);
    expect(tiny.size).toBeLessThanOrEqual(7);
  });
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
