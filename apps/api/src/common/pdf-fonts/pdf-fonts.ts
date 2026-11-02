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

const CJK_CACHE_DIR =
  process.env.PDF_FONT_CACHE_DIR ?? join(tmpdir(), 'lawbid-pdf-fonts');

/** Full path of a script font, or undefined while it is not on disk. */
function fontPath(f: ScriptFont): string | undefined {
  if (!f.cjk) {
    const p = FONTS_DIR && join(FONTS_DIR, 'noto', f.file);
    return p && existsSync(p) ? p : undefined;
  }
  const local = FONTS_DIR && join(FONTS_DIR, 'noto', f.file);
  if (local && existsSync(local)) return local;
  const cached = join(CJK_CACHE_DIR, f.file);
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

const scriptCovers = new Map<string, FontkitFont | null>();
/** Whether the script font is on disk and has a glyph for [cp] (spaces, colons...). */
function fontHasGlyph(f: ScriptFont, cp: number): boolean {
  if (!scriptCovers.has(f.file)) {
    const p = fontPath(f);
    scriptCovers.set(f.file, p ? openFont(p) : null);
  }
  return scriptCovers.get(f.file)?.hasGlyphForCodePoint(cp) ?? false;
}

const familyOf = (f: ScriptFont): string =>
  `Noto-${f.file.replace(/-Regular\.(ttf|otf)$/, '')}`;

/** Script font for a code point Inter cannot draw, if we have one. */
function scriptFontFor(ch: string): ScriptFont | undefined {
  return SCRIPT_FONTS.find((f) => f.scripts.test(ch));
}

/**
 * Splits [text] into runs. Characters Inter draws, plus spaces, digits and
 * punctuation (no script of their own), stay with the run they follow so a
 * sentence does not flip fonts at every comma.
 */
export function splitRuns(text: string): FontRun[] {
  const covers = loadInterCovers();
  const runs: FontRun[] = [];
  let current: ScriptFont | undefined; // script font of the last run, if not Inter
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    const sf = covers(cp) ? undefined : scriptFontFor(ch);
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
        SCRIPT_FONTS.find((f) => !f.cjk && fontHasGlyph(f, cp)) ??
        current;
      owner = host;
      if (host) {
        font = familyOf(host);
        rtl = host.rtl === true;
      }
    } else if (
      current &&
      /[\s\p{P}\p{N}]/u.test(ch) &&
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

const STRONG_RTL = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u;
/** Whether the first letter of [text] is Arabic or Hebrew. */
export const startsRtl = (text: string): boolean => STRONG_RTL.test(text);

/** Visual order for an RTL run: pdfkit draws left to right. */
function visualOrder(run: string): string {
  // Reverse by code point; combining marks and shaping stay attached because
  // fontkit shapes the reversed string with the script's own direction off.
  return [...run].reverse().join('');
}

type TextFn = (...args: unknown[]) => unknown;

/**
 * Registers Inter and routes `doc.text` through the script fallback. Safe to
 * call on any PDFDocument; without the bundled Inter it leaves pdfkit's
 * default font alone.
 */
export function applyPdfFonts(doc: PDFKit.PDFDocument): void {
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
    let runs = splitRuns(text);
    if (runs.every((r) => r.font === 'Inter')) return original(...args);
    // Poor man's bidi: a string that starts in Hebrew/Arabic is an RTL
    // paragraph, so its runs go in reverse (each RTL run is reversed inside).
    if (startsRtl(text)) runs = runs.slice().reverse();

    // text(str, options) or text(str, x, y, options)
    const posArgs = typeof a === 'number' ? [a, b] : [];
    const opts = (
      typeof a === 'object' && a !== null
        ? a
        : typeof b === 'object' && b !== null
          ? b
          : c
    ) as Record<string, unknown> | undefined;
    runs.forEach((run, i) => {
      doc.font(fontFor(run.font));
      const last = i === runs.length - 1;
      const o = {
        ...(opts ?? {}),
        continued: last ? opts?.continued === true : true,
      };
      const s = run.rtl ? visualOrder(run.text) : run.text;
      original(s, ...(i === 0 ? posArgs : []), o);
    });
    doc.font('Inter');
    return doc;
  };
  (doc as unknown as { text: TextFn }).text = patched;
}

// ---- CJK download -------------------------------------------------------

interface CjkEntry {
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
): Promise<string[]> {
  const got: string[] = [];
  try {
    if (!FONTS_DIR) return got;
    const manifest = JSON.parse(
      readFileSync(join(FONTS_DIR, 'noto', 'manifest.json'), 'utf8'),
    ) as { cjk?: Record<string, CjkEntry> };
    mkdirSync(CJK_CACHE_DIR, { recursive: true });
    for (const [file, e] of Object.entries(manifest.cjk ?? {})) {
      if (!e.uploaded || !e.cdn.startsWith('https://')) continue;
      const target = join(CJK_CACHE_DIR, file);
      if (existsSync(target) && sha256(readFileSync(target)) === e.sha256) {
        got.push(file);
        continue;
      }
      const res = await fetchFn(e.cdn);
      if (!res.ok) {
        warnOnce(file, `download of ${file} failed: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha256(buf) !== e.sha256) {
        warnOnce(
          file,
          `${file} from the CDN does not match the manifest sha256, ignored`,
        );
        continue;
      }
      const tmp = `${target}.${process.pid}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, target);
      got.push(file);
    }
  } catch (err) {
    warnOnce('warm', `CJK font warm-up failed: ${String(err)}`);
  }
  return got;
}

const sha256 = (b: Buffer): string =>
  createHash('sha256').update(b).digest('hex');
