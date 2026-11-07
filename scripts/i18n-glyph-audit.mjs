// Glyph coverage audit (owner 2026-11-02: "languages showed squares/crosses —
// never again"). For every language in the translation workbook it collects
// the characters actually used and answers three questions:
//   1. Which are drawn by the fonts we ship (Inter + Source Serif 4)?
//   2. Which fall to a fallback font, and does every such script have a
//      fallback on every surface (scripts/i18n-glyph-scripts.json)?
//   3. Do the surfaces that make the fallback possible still exist
//      (web CSP allows the engine's Noto fallback host; PDFs know their limit)?
// `--write-charset` refreshes docs/dev/glyph-charset.txt (the code points every font subset must keep).
// `--ci` fails on a script with no declared fallback, private-use or
// unassigned code points, and a missing CSP host. Usage: node scripts/i18n-glyph-audit.mjs [--ci] [--json]
import { readSeed } from './lib/translations-seed.mjs';
import * as fontkit from 'fontkit';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ci = process.argv.includes('--ci');
const json = process.argv.includes('--json');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n-glyph-scripts.json'), 'utf8'));

const bundled = ['apps/mobile/assets/fonts/Inter-Variable.ttf', 'apps/mobile/assets/fonts/SourceSerif4-Variable.ttf']
  .map((p) => fontkit.openSync(path.join(ROOT, p)));
const covered = (cp) => bundled.some((f) => f.hasGlyphForCodePoint(cp));

const { langs, rows } = readSeed();
const used = Object.fromEntries(langs.map((l) => [l, new Map()])); // lang -> cp -> count
for (const r of rows) {
  for (const l of langs) {
    for (const ch of r.cells[l]) used[l].set(ch.codePointAt(0), (used[l].get(ch.codePointAt(0)) ?? 0) + 1);
  }
}

const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala', 'Thai', 'Lao', 'Tibetan', 'Myanmar', 'Georgian', 'Armenian', 'Ethiopic', 'Khmer', 'Hangul', 'Han', 'Hiragana', 'Katakana', 'Thaana', 'Mongolian', 'Tifinagh', 'Syriac'];
const SCRIPT_RES = SCRIPTS.map((sc) => [sc, new RegExp(`\\p{Script=${sc}}`, 'u')]);
const scriptCache = new Map();
const scriptOf = (cp) => {
  if (!scriptCache.has(cp)) scriptCache.set(cp, scriptOfUncached(cp));
  return scriptCache.get(cp);
};
const scriptOfUncached = (cp) => {
  const ch = String.fromCodePoint(cp);
  if (/\p{Co}/u.test(ch)) return 'PRIVATE_USE';
  if (/\p{Cn}/u.test(ch)) return 'UNASSIGNED';
  if (/[\p{Z}\p{C}]/u.test(ch)) return 'Common';
  for (const [sc, re] of SCRIPT_RES) if (re.test(ch)) return sc;
  return /\p{Script=Common}|\p{Script=Inherited}/u.test(ch) ? 'Common' : 'UNKNOWN';
};

// Everything the shipped fonts must keep when someone subsets them (web thread:
// font subsetting, PR "fonts -455 KB"). Written to docs/dev/glyph-charset.txt.
const CHARSET = path.join(ROOT, 'docs/dev/glyph-charset.txt');
const keep = new Set();
for (let cp = 0x20; cp <= 0x7e; cp++) keep.add(cp); // user-typed text: never drop Basic Latin / Latin-1
for (let cp = 0xa0; cp <= 0xff; cp++) keep.add(cp);
for (const m of Object.values(used)) for (const cp of m.keys()) if (covered(cp)) keep.add(cp);
const ranges = [];
for (const cp of [...keep].sort((a, b) => a - b)) {
  const last = ranges[ranges.length - 1];
  if (last && cp === last[1] + 1) last[1] = cp; else ranges.push([cp, cp]);
}
const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const charsetText = ranges.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(',') + '\n';
if (process.argv.includes('--write-charset')) fs.writeFileSync(CHARSET, charsetText);

const problems = [];
// The committed file must be a superset of what the translations use (extra code points are fine).
const inFile = new Set();
if (fs.existsSync(CHARSET)) {
  for (const part of fs.readFileSync(CHARSET, 'utf8').trim().split(',')) {
    const [a, b = a] = part.replace(/U\+/g, '').split('-').map((h) => parseInt(h, 16));
    for (let cp = a; cp <= b; cp++) inFile.add(cp);
  }
}
const lost = [...keep].filter((cp) => !inFile.has(cp));
if (lost.length) {
  problems.push(`docs/dev/glyph-charset.txt lacks ${lost.length} code points used by translations (e.g. U+${hex(lost[0])}): run node scripts/i18n-glyph-audit.mjs --write-charset and commit it (font subsetting reads it)`);
}
const perLang = {};
for (const l of langs) {
  const total = [...used[l].values()].reduce((a, b) => a + b, 0);
  let ok = 0;
  const fb = {}; // script -> {chars, n}
  for (const [cp, n] of used[l]) {
    const sc = scriptOf(cp);
    if (sc === 'PRIVATE_USE' || sc === 'UNASSIGNED' || sc === 'UNKNOWN') {
      problems.push(`${l}: U+${cp.toString(16).toUpperCase()} (${sc})`);
      continue;
    }
    if (covered(cp)) { ok += n; continue; }
    if (sc === 'Common') continue; // punctuation/symbols the system always has
    (fb[sc] ??= { chars: new Set(), n: 0 }).chars.add(String.fromCodePoint(cp));
    fb[sc].n += n;
  }
  perLang[l] = {
    bundledShare: Number((ok / total).toFixed(4)),
    fallbackScripts: Object.fromEntries(Object.entries(fb).map(([k, v]) => [k, v.chars.size])),
  };
}

// Every script that needs a fallback must be declared with the font that serves it.
const undeclared = new Set();
for (const [l, v] of Object.entries(perLang)) {
  for (const sc of Object.keys(v.fallbackScripts)) {
    const surf = policy.fallback[sc] ?? [];
    if (!['android', 'ios', 'web'].every((x) => surf.includes(x))) undeclared.add(`${l}:${sc}`);
  }
}
// Web: the engine fetches Noto fallbacks from Google; the CSP must allow it.
const tf = fs.readFileSync(path.join(ROOT, 'infra/modules/web/main.tf'), 'utf8');
// Text-level check of the Terraform source (not the rendered policy): the host must appear in
// the connect list and in font-src. A stack that overrides those variables is not seen here.
const hostLines = tf.split('\n').filter((l) => !l.trim().startsWith('#') || /"https:\/\/fonts\.gstatic\.com"/.test(l));
const cspOk = hostLines.some((l) => /"https:\/\/fonts\.gstatic\.com"/.test(l));
const fontSrcOk = /font-src[^\n]*fonts\.gstatic\.com/.test(tf);
if (!cspOk) problems.push('web CSP: fonts.gstatic.com missing from connect-src (engine fallback fonts would not load → squares)');
if (!fontSrcOk) problems.push('web CSP: fonts.gstatic.com missing from font-src');
for (const u of undeclared) problems.push(`no fallback font declared for ${u} in scripts/i18n-glyph-scripts.json`);

const needs = {};
for (const [l, v] of Object.entries(perLang)) for (const sc of Object.keys(v.fallbackScripts)) (needs[sc] ??= []).push(l);
const summary = {
  languages: langs.length,
  fullyBundled: Object.entries(perLang).filter(([, v]) => Object.keys(v.fallbackScripts).length === 0).map(([l]) => l),
  scriptsNeedingFallback: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, v.length])),
  pdfNote: policy.pdf,
  problems,
};
if (json) console.log(JSON.stringify({ summary, perLang }, null, 1));
else console.log(JSON.stringify(summary, null, 1));
if (ci && problems.length) process.exit(1);
