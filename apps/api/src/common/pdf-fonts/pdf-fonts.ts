import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import bidiFactory from 'bidi-js';

/**
 * Per-script font fallback for server PDFs (owner 2026-11-02: no empty boxes,
 * in any of the 85 app languages). pdfkit draws a whole string with one font,
 * so [applyPdfFonts] splits every string into runs by script and draws each
 * run with Inter (Latin/Cyrillic/Greek) or the matching Noto Sans file.
 * Noto Sans for 18 scripts lives in assets/fonts/noto; the CJK files are too
 * big for git and come from the CDN listed in noto/manifest.json (sha256
 * checked, cached on disk, see [warmCjkFonts]). Until a CJK file is cached
 * its characters still print as boxes, which is logged once.
 */

/** `assets/fonts` next to the API's package.json, found from any build depth. */
function findFontsDir(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 9; i += 1) {
    const candidate = join(dir, 'assets', 'fonts');
    if (existsSync(join(candidate, 'Inter-Variable.ttf'))) return candidate;
    dir = dirname(dir);
  }
  return undefined;
}

export const FONTS_DIR = findFontsDir();
export const INTER_PATH = FONTS_DIR && join(FONTS_DIR, 'Inter-Variable.ttf');

interface ScriptFont {
  /** Unicode Script name; the run is drawn with [file]. */
  scripts: RegExp;
  file: string;
  rtl?: boolean;
  cjk?: boolean;
}

const re = (names: string): RegExp =>
  new RegExp(
    `^(?:${names
      .split('|')
      .map((n) => `\\p{Script=${n}}`)
      .join('|')})$`,
    'u',
  );

/** Order matters only for CJK: Hangul and kana before Han. */
const SCRIPT_FONTS: ScriptFont[] = [
  { scripts: re('Arabic'), file: 'NotoSansArabic-Regular.ttf', rtl: true },
  { scripts: re('Hebrew'), file: 'NotoSansHebrew-Regular.ttf', rtl: true },
  { scripts: re('Devanagari'), file: 'NotoSansDevanagari-Regular.ttf' },
  { scripts: re('Bengali'), file: 'NotoSansBengali-Regular.ttf' },
  { scripts: re('Gurmukhi'), file: 'NotoSansGurmukhi-Regular.ttf' },
  { scripts: re('Gujarati'), file: 'NotoSansGujarati-Regular.ttf' },
  { scripts: re('Tamil'), file: 'NotoSansTamil-Regular.ttf' },
  { scripts: re('Telugu'), file: 'NotoSansTelugu-Regular.ttf' },
  { scripts: re('Kannada'), file: 'NotoSansKannada-Regular.ttf' },
  { scripts: re('Malayalam'), file: 'NotoSansMalayalam-Regular.ttf' },
  { scripts: re('Sinhala'), file: 'NotoSansSinhala-Regular.ttf' },
  { scripts: re('Thai'), file: 'NotoSansThai-Regular.ttf' },
  { scripts: re('Khmer'), file: 'NotoSansKhmer-Regular.ttf' },
  { scripts: re('Lao'), file: 'NotoSansLao-Regular.ttf' },
  { scripts: re('Myanmar'), file: 'NotoSansMyanmar-Regular.ttf' },
  { scripts: re('Georgian'), file: 'NotoSansGeorgian-Regular.ttf' },
  { scripts: re('Armenian'), file: 'NotoSansArmenian-Regular.ttf' },
  { scripts: re('Ethiopic'), file: 'NotoSansEthiopic-Regular.ttf' },
  { scripts: re('Hangul'), file: 'NotoSansCJKkr-Regular.otf', cjk: true },
  {
    scripts: re('Hiragana|Katakana'),
    file: 'NotoSansCJKjp-Regular.otf',
    cjk: true,
  },
  { scripts: re('Han'), file: 'NotoSansCJKsc-Regular.otf', cjk: true },
];

const cjkCacheDir = (): string =>
  process.env.PDF_FONT_CACHE_DIR ?? join(tmpdir(), 'lawbid-pdf-fonts');

/** Full path of a script font, or undefined while it is not on disk. */
function fontPath(f: ScriptFont): string | undefined {
  if (!f.cjk) {
    const p = FONTS_DIR && join(FONTS_DIR, 'noto', f.file);
    return p && existsSync(p) ? p : undefined;
  }
  const local = FONTS_DIR && join(FONTS_DIR, 'noto', f.file);
  if (local && existsSync(local)) return local;
  const cached = join(cjkCacheDir(), f.file);
  return existsSync(cached) ? cached : undefined;
}

const warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[pdf-fonts] ${msg}`);
}

/** A string cut into runs, each with the font family to draw it with. */
export interface FontRun {
  text: string;
  /** `Inter` or a registered Noto family name. */
  font: string;
  rtl: boolean;
}

type CoversFn = (cp: number) => boolean;
type FontkitFont = { hasGlyphForCodePoint(cp: number): boolean };

function openFont(path: string): FontkitFont {
  // fontkit ships with pdfkit.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fontkit = require('fontkit') as { create: (b: Buffer) => FontkitFont };
  return fontkit.create(readFileSync(path));
}

let interCovers: CoversFn | undefined;
function loadInterCovers(): CoversFn {
  if (interCovers) return interCovers;
  if (!INTER_PATH) return (interCovers = () => true);
  const font = openFont(INTER_PATH);
  return (interCovers = (cp) => font.hasGlyphForCodePoint(cp));
}

const scriptCovers = new Map<string, FontkitFont>();
/** Script font that has a glyph for a code point no Inter run can draw. */
const hostCache = new Map<number, ScriptFont | undefined>();
/** Whether the script font is on disk and has a glyph for [cp] (spaces, colons...). */
function fontHasGlyph(f: ScriptFont, cp: number): boolean {
  let font = scriptCovers.get(f.file);
  if (!font) {
    const p = fontPath(f);
    if (!p) return false; // not on disk yet (CJK still downloading): ask again later
    font = openFont(p);
    scriptCovers.set(f.file, font);
  }
  return font.hasGlyphForCodePoint(cp);
}

const familyOf = (f: ScriptFont): string =>
  `Noto-${f.file.replace(/-Regular\.(ttf|otf)$/, '')}`;

function anyHost(cp: number): ScriptFont | undefined {
  if (!hostCache.has(cp)) {
    hostCache.set(
      cp,
      SCRIPT_FONTS.find((f) => !f.cjk && fontHasGlyph(f, cp)),
    );
  }
  return hostCache.get(cp);
}

const CJK_BY_FILE = (file: string): ScriptFont =>
  SCRIPT_FONTS.find((f) => f.file === file) as ScriptFont;

/**
 * Which CJK face draws Han characters: Japanese for ja or text with kana,
 * Korean for ko, Simplified Chinese otherwise (zh, unknown). The same
 * ideograph has different glyph shapes per language.
 */
function hanFont(text: string, lang?: string): ScriptFont {
  const l = (lang ?? '').toLowerCase();
  if (
    l.startsWith('ja') ||
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)
  ) {
    return CJK_BY_FILE('NotoSansCJKjp-Regular.otf');
  }
  if (l.startsWith('ko')) return CJK_BY_FILE('NotoSansCJKkr-Regular.otf');
  return CJK_BY_FILE('NotoSansCJKsc-Regular.otf');
}

/** Script font for a code point Inter cannot draw, if we have one. */
function scriptFontFor(ch: string, han: ScriptFont): ScriptFont | undefined {
  const f = SCRIPT_FONTS.find((x) => x.scripts.test(ch));
  return f?.file === 'NotoSansCJKsc-Regular.otf' ? han : f;
}

/**
 * Splits [text] into runs. Characters Inter draws, plus spaces, digits and
 * punctuation (no script of their own), stay with the run they follow so a
 * sentence does not flip fonts at every comma.
 */
export function splitRuns(text: string, lang?: string): FontRun[] {
  const covers = loadInterCovers();
  const han = hanFont(text, lang);
  const runs: FontRun[] = [];
  let current: ScriptFont | undefined; // script font of the last run, if not Inter
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    const sf = covers(cp) ? undefined : scriptFontFor(ch, han);
    let font = 'Inter';
    let rtl = false;
    let owner: ScriptFont | undefined;
    if (sf) {
      owner = sf;
      font = familyOf(sf);
      rtl = sf.rtl === true;
    } else if (!covers(cp)) {
      // Combining mark, danda, Arabic comma...: the current run's font if it
      // has the glyph, else any script font that does, else stay (box).
      const host =
        (current && fontHasGlyph(current, cp) ? current : undefined) ??
        anyHost(cp) ??
        current;
      owner = host;
      if (host) {
        font = familyOf(host);
        rtl = host.rtl === true;
      }
    } else if (
      current &&
      // Digits never join an RTL run: fontkit would mirror 1500 into 0051.
      (current.rtl ? /\s/u : /[\s\p{P}\p{N}]/u).test(ch) &&
      fontHasGlyph(current, cp)
    ) {
      // Space/punctuation between words of one script keeps the run whole.
      owner = current;
      font = familyOf(current);
      rtl = current.rtl === true;
    }
    current = owner;
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ text: ch, font, rtl });
  }
  return runs;
}

/** True when [text] needs a font other than Inter. */
export const needsFallback = (text: string): boolean =>
  splitRuns(text).some((r) => r.font !== 'Inter');

const bidi = bidiFactory();
const HAS_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

/** A piece of a line, in visual (left to right) order, with its font. */
export interface Fragment {
  text: string;
  font: string;
}

/**
 * pdfkit wraps by words before shaping, so a multi-word RTL run would come out
 * with its words left to right. Reverse the word order (each word is shaped
 * right to left by fontkit), which gives the visual order of the line.
 */
export function wordsRtl(run: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(run) as RegExpExecArray;
  return `${m[3]}${m[2].split(/\s+/).reverse().join(' ')}${m[1]}`;
}

/** Reverses a neutral piece (punctuation, spaces) and mirrors brackets. */
const mirrorReverse = (t: string): string =>
  [...t]
    .reverse()
    .map((ch) => bidi.getMirroredCharacter(ch) ?? ch)
    .join('');

/**
 * Lays one line out in visual order with the Unicode Bidirectional Algorithm
 * (UAX #9, bidi-js): levels per character, runs reordered per rule L2, RTL
 * runs shaped by fontkit, digits and Latin inside Arabic/Hebrew kept left to
 * right, brackets mirrored. [rtlParagraph] is the paragraph direction.
 */
export function layoutLine(
  text: string,
  lang?: string,
): { fragments: Fragment[]; rtlParagraph: boolean } {
  if (!HAS_RTL.test(text)) {
    return {
      fragments: spacesOnInter(
        splitRuns(text, lang).map(({ text: t, font }) => ({ text: t, font })),
      ),
      rtlParagraph: false,
    };
  }
  const { levels, paragraphs } = bidi.getEmbeddingLevels(text);
  const rtlParagraph = (paragraphs[0]?.level ?? 0) % 2 === 1;
  // Level runs (indices are UTF-16 units; both halves of a pair share a level).
  const runs: { text: string; level: number }[] = [];
  let i = 0;
  for (const ch of text) {
    const level = levels[i];
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.text += ch;
    else runs.push({ text: ch, level });
    i += ch.length;
  }
  // L2: from the highest level down to the lowest odd level, reverse every
  // maximal sequence of runs at that level or higher.
  const maxLevel = Math.max(...runs.map((r) => r.level));
  const minOdd = Math.min(
    ...runs.map((r) => r.level).filter((l) => l % 2 === 1),
  );
  for (let lvl = maxLevel; lvl >= minOdd; lvl -= 1) {
    for (let k = 0; k < runs.length; k += 1) {
      if ((runs[k] as { level: number }).level < lvl) continue;
      let end = k;
      while (
        end + 1 < runs.length &&
        (runs[end + 1] as { level: number }).level >= lvl
      ) {
        end += 1;
      }
      const seg = runs.slice(k, end + 1).reverse();
      runs.splice(k, seg.length, ...seg);
      k = end;
    }
  }
  const fragments: Fragment[] = [];
  for (const run of runs) {
    const parts = splitRuns(run.text, lang);
    if (run.level % 2 === 0) {
      for (const p of parts) fragments.push({ text: p.text, font: p.font });
      continue;
    }
    for (const p of parts.reverse()) {
      fragments.push({
        text: p.rtl ? wordsRtl(p.text) : mirrorReverse(p.text),
        font: p.font,
      });
    }
  }
  return { fragments: spacesOnInter(fragments), rtlParagraph };
}

/** pdfkit drops word spaces drawn by some Noto fonts: draw each space with Inter. */
function spacesOnInter(fragments: Fragment[]): Fragment[] {
  const out: Fragment[] = [];
  for (const f of fragments) {
    if (f.font === 'Inter' || !f.text.includes(' ')) {
      out.push(f);
      continue;
    }
    for (const piece of f.text.split(/( +)/)) {
      if (piece === '') continue;
      out.push({ text: piece, font: piece.trim() === '' ? 'Inter' : f.font });
    }
  }
  return out;
}

type TextFn = (...args: unknown[]) => unknown;

export interface PdfFontOptions {
  /** Language of the document (ja, ko, zh...): picks the CJK face for Han. */
  lang?: string;
}

/**
 * Registers Inter and routes `doc.text` through the script fallback and the
 * bidi layout. Safe to call on any PDFDocument; without the bundled Inter it
 * leaves pdfkit's default font alone.
 */
export function applyPdfFonts(
  doc: PDFKit.PDFDocument,
  options: PdfFontOptions = {},
): void {
  if (!INTER_PATH) return;
  doc.registerFont('Inter', INTER_PATH);
  doc.font('Inter');

  const registered = new Set<string>();
  const fontFor = (family: string): string => {
    if (family === 'Inter') return 'Inter';
    if (registered.has(family)) return family;
    const sf = SCRIPT_FONTS.find((f) => familyOf(f) === family);
    const p = sf && fontPath(sf);
    if (!sf || !p) {
      warnOnce(
        family,
        `${family} is not available, its characters print as boxes`,
      );
      return 'Inter';
    }
    doc.registerFont(family, p);
    registered.add(family);
    return family;
  };

  const original = doc.text.bind(doc) as TextFn;
  const patched: TextFn = (...args) => {
    const [text, a, b, c] = args;
    if (typeof text !== 'string' || text === '') return original(...args);
    const { fragments, rtlParagraph } = layoutLine(text, options.lang);
    if (!rtlParagraph && fragments.every((f) => f.font === 'Inter')) {
      return original(...args);
    }

    // text(str, options) or text(str, x, y, options)
    const hasPos = typeof a === 'number';
    const opts = (
      typeof a === 'object' && a !== null
        ? a
        : typeof b === 'object' && b !== null
          ? b
          : c
    ) as Record<string, unknown> | undefined;
    let x = hasPos ? a : undefined;
    const startX = doc.x;
    const y = hasPos ? (b as number | undefined) : undefined;

    // pdfkit cannot align a line drawn as several continued fragments, so a
    // line that fits is placed by measuring: an RTL paragraph sits against the
    // right edge unless told otherwise, center and right work for every script.
    let placed = false;
    const requested = opts?.align as string | undefined;
    const align =
      requested === undefined || requested === 'left' || requested === 'justify'
        ? rtlParagraph
          ? 'right'
          : 'left'
        : requested;
    if (align !== 'left') {
      const x0 = x ?? doc.x;
      const box =
        (opts?.width as number | undefined) ??
        doc.page.width - doc.page.margins.right - x0;
      let total = 0;
      for (const f of fragments) {
        doc.font(fontFor(f.font));
        total += doc.widthOfString(f.text);
      }
      if (total <= box) {
        x = align === 'center' ? x0 + (box - total) / 2 : x0 + box - total;
        placed = true;
      }
    }

    fragments.forEach((f, i) => {
      doc.font(fontFor(f.font));
      const last = i === fragments.length - 1;
      const o = {
        ...(opts ?? {}),
        // placed by hand: the fragment must not be aligned a second time
        ...(placed ? { align: 'left', width: undefined } : {}),
        continued: last ? opts?.continued === true : true,
      };
      if (i === 0 && x !== undefined) original(f.text, x, y ?? doc.y, o);
      else original(f.text, o);
    });
    doc.font('Inter');
    // A shifted start (right-aligned RTL line) must not move the next line.
    if (!hasPos && opts?.continued !== true) doc.x = startX;
    return doc;
  };
  (doc as unknown as { text: TextFn }).text = patched;
}

// ---- CJK download -------------------------------------------------------

export interface CjkEntry {
  sha256: string;
  cdn: string;
  uploaded: boolean;
}

/**
 * Downloads the CJK fonts the manifest marks as uploaded into the disk cache
 * (sha256 verified, written atomically). Never throws; call once at startup
 * without awaiting.
 */
export async function warmCjkFonts(
  fetchFn: typeof fetch = fetch,
  manifestOverride?: { cjk?: Record<string, CjkEntry> },
): Promise<string[]> {
  const got: string[] = [];
  try {
    if (!FONTS_DIR) return got;
    const manifest =
      manifestOverride ??
      (JSON.parse(
        readFileSync(join(FONTS_DIR, 'noto', 'manifest.json'), 'utf8'),
      ) as { cjk?: Record<string, CjkEntry> });
    const cacheDir = cjkCacheDir();
    mkdirSync(cacheDir, { recursive: true });
    const one = async (file: string, e: CjkEntry): Promise<void> => {
      if (!e.uploaded || !e.cdn.startsWith('https://')) return;
      const target = join(cacheDir, file);
      if (existsSync(target) && sha256(readFileSync(target)) === e.sha256) {
        got.push(file);
        return;
      }
      const res = await fetchFn(e.cdn, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        warnOnce(file, `download of ${file} failed: HTTP ${res.status}`);
        return;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha256(buf) !== e.sha256) {
        warnOnce(
          file,
          `${file} from the CDN does not match the manifest sha256, ignored`,
        );
        return;
      }
      const tmp = `${target}.${process.pid}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, target);
      got.push(file);
    };
    // independent files: download side by side, not one after the other
    await Promise.all(
      Object.entries(manifest.cjk ?? {}).map(([file, e]) => one(file, e)),
    );
  } catch (err) {
    warnOnce('warm', `CJK font warm-up failed: ${String(err)}`);
  }
  return got;
}

const sha256 = (b: Buffer): string =>
  createHash('sha256').update(b).digest('hex');
