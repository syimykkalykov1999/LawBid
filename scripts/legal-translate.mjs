#!/usr/bin/env node
// Owner 2026-10-22 (audit #4 §4): the legal documents in the ten most used
// app languages. The repo keeps legal texts as committed Markdown files
// (apps/api/assets/legal/<type>.<lang>.md, loaded as DRAFTS on boot by
// LegalDocumentsSeed); en and ru are written by hand. This script makes
// the others from the English text with the same provider the app uses
// for translations (Google Cloud Translation v2), line by line so the
// Markdown structure (headings, lists, links, placeholders) survives.
//
//   GOOGLE_TRANSLATE_API_KEY=… node scripts/legal-translate.mjs           # missing files only
//   GOOGLE_TRANSLATE_API_KEY=… node scripts/legal-translate.mjs --force   # redo every file
//   node scripts/legal-translate.mjs --check                               # list what is missing (CI, no key)
//   … --langs es,fr --docs terms,privacy                                    # a subset
//
// Every generated file starts with a translated notice that the English
// original governs. The files are drafts: the owner reads them (a licensed
// attorney reviews them) and publishes each from the admin (Документы).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEGAL_DIR = path.join(ROOT, 'apps/api/assets/legal');
/** Keep in sync with LEGAL_LOCALES (legal-documents.constants.ts). */
export const TARGET_LANGS = ['ru', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'uk'];
/** ru is translated only where no hand-written text exists. */
export const NOTICE_EN =
  'This is a machine translation of the English original. If the two differ, the English version governs.';

const MARKER = /^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)*)(.*)$/;

/** Splits a Markdown line into the part kept as is (indent, heading /
 * list / quote markers) and the text to translate. */
export function splitLine(line) {
  const m = MARKER.exec(line);
  return { prefix: m?.[1] ?? '', text: m?.[2] ?? line };
}

/** A line with nothing to translate: blank, a rule, a table separator, a
 * bare link or an HTML comment. */
export function skipLine(text) {
  const t = text.trim();
  return (
    t === '' ||
    /^[-*_]{3,}$/.test(t) ||
    /^\|?[\s:-]+(\|[\s:-]+)+\|?$/.test(t) ||
    /^<https?:\/\/\S+>$/.test(t) ||
    /^https?:\/\/\S+$/.test(t) ||
    /^<!--.*-->$/.test(t)
  );
}

/** Links, e-mails and {placeholders} must come back unchanged: they are
 * wrapped in a no-translate span (format=html) and unwrapped after. */
export function protect(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /(\]\([^)\s]+\)|https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+|\{[a-zA-Z_]+\}|LawBid)/g,
      '<span translate="no">$1</span>',
    );
}

export function unprotect(html) {
  return html
    .replace(/<span translate="no">([\s\S]*?)<\/span>/g, '$1')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

async function translateBatch(key, texts, target) {
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'en', target, format: 'html' }),
    },
  );
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.data.translations.map((t) => t.translatedText);
}

/** Translates one English Markdown document into [target]. */
export async function translateDoc(md, target, translate) {
  const lines = [`_${NOTICE_EN}_`, '', ...md.replace(/\r/g, '').split('\n')];
  const jobs = [];
  const parts = lines.map((line) => {
    const { prefix, text } = splitLine(line);
    if (skipLine(text)) return { prefix, text, i: -1 };
    jobs.push(protect(text));
    return { prefix, text, i: jobs.length - 1 };
  });
  const out = [];
  for (let i = 0; i < jobs.length; i += 100) {
    out.push(...(await translate(jobs.slice(i, i + 100), target)));
  }
  return (
    parts
      .map((p) => (p.i < 0 ? p.prefix + p.text : p.prefix + unprotect(out[p.i])))
      .join('\n')
      .trimEnd() + '\n'
  );
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const force = process.argv.includes('--force');
  const check = process.argv.includes('--check');
  const langs = arg('langs')?.split(',') ?? TARGET_LANGS;
  const docs = (arg('docs')?.split(',') ??
    fs
      .readdirSync(LEGAL_DIR)
      .filter((f) => f.endsWith('.en.md'))
      .map((f) => f.slice(0, -'.en.md'.length))
  ).sort();
  const todo = [];
  for (const doc of docs) {
    for (const lang of langs) {
      const file = path.join(LEGAL_DIR, `${doc}.${lang}.md`);
      if (force && lang !== 'ru' ? true : !fs.existsSync(file)) todo.push({ doc, lang, file });
    }
  }
  if (check) {
    for (const t of todo) console.log(`missing: ${path.relative(ROOT, t.file)}`);
    console.log(`${todo.length} legal translation(s) missing`);
    return;
  }
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) {
    console.error('GOOGLE_TRANSLATE_API_KEY is not set (Admin → Integrations → Google Translate key).');
    process.exit(2);
  }
  for (const t of todo) {
    const en = fs.readFileSync(path.join(LEGAL_DIR, `${t.doc}.en.md`), 'utf8');
    const md = await translateDoc(en, t.lang, (q, target) => translateBatch(key, q, target));
    fs.writeFileSync(t.file, md);
    console.log(`wrote ${path.relative(ROOT, t.file)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
