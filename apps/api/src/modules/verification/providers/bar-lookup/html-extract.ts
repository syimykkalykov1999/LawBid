import { load, type CheerioAPI } from 'cheerio';

/**
 * Owner 2026-10-28: reading one value out of a state bar's public page.
 * A selector is one of
 *   `css:<selector>` (or a bare CSS selector) — the text of the first match;
 *     `css:<selector>@<attr>` reads an attribute instead;
 *   `label:<text>`   — the value printed next to a caption such as
 *     "License Status:" (`<dt>…</dt><dd>…</dd>`, `<td>…</td><td>…</td>`,
 *     `<b>Status: <span>Active</span></b>`, `<strong>No:</strong> 123`);
 *   `regex:<pattern>` — the first group of a pattern over the page text.
 * Several parts joined by ` && ` are read one by one and joined with " / "
 * (two status fields: "Active / Good Standing").
 */

type Root = ReturnType<CheerioAPI>;
/** A DOM node of the parsed page (domhandler's AnyNode, via cheerio). */
type DomNode = Parameters<CheerioAPI['contains']>[0];

export interface HtmlDoc {
  $: CheerioAPI;
  root: Root;
}

export function parseHtml(html: string): HtmlDoc {
  const $ = load(html);
  $('script, style, noscript, template').remove();
  return { $, root: $.root() };
}

/** Whitespace collapsed, &nbsp; folded, trimmed. */
export function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/[\s\u00a0]+/g, ' ').trim();
}

/** The value of [selector] inside [scope], or null when absent/empty. */
export function extract(
  doc: HtmlDoc,
  scope: Root,
  selector: string | undefined,
): string | null {
  if (!selector?.trim()) return null;
  const parts = selector
    .split(' && ')
    .map((p) => joined(doc, scope, p.trim()))
    .filter((v): v is string => v !== null);
  return parts.length ? parts.join(' / ') : null;
}

/** `a ++ b`: the parts glued with a space ("Gregory" "W." "Abbott"). */
function joined(doc: HtmlDoc, scope: Root, sel: string): string | null {
  const parts = sel
    .split(' ++ ')
    .map((p) => withFilter(doc, scope, p.trim()))
    .filter((v): v is string => v !== null);
  return parts.length ? parts.join(' ') : null;
}

/** `<selector>|re:<pattern>`: keep the first group of the pattern. */
function withFilter(doc: HtmlDoc, scope: Root, sel: string): string | null {
  const i = sel.indexOf('|re:');
  if (i < 0) return extractOne(doc, scope, sel);
  const value = extractOne(doc, scope, sel.slice(0, i).trim());
  if (value === null) return null;
  let re: RegExp;
  try {
    re = new RegExp(sel.slice(i + 4), 'i');
  } catch {
    throw new Error(`Bad pattern: ${sel.slice(i + 4)}`);
  }
  const m = re.exec(value);
  const v = clean(m?.[1] ?? m?.[0]);
  return v || null;
}

function extractOne(doc: HtmlDoc, scope: Root, sel: string): string | null {
  if (sel.startsWith('label:')) return byLabel(doc, scope, sel.slice(6));
  if (sel.startsWith('regex:')) return byRegex(scope, sel.slice(6));
  const css = sel.startsWith('css:') ? sel.slice(4) : sel;
  const at = css.lastIndexOf('@');
  const hasAttr =
    at > 0 && /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(css.slice(at + 1));
  const query = hasAttr ? css.slice(0, at) : css;
  let el: Root;
  try {
    el = scope.find(query).first();
  } catch {
    throw new Error(`Bad CSS selector: ${query}`);
  }
  if (!el.length) return null;
  const v = clean(hasAttr ? el.attr(css.slice(at + 1)) : el.text());
  return v || null;
}

function byRegex(scope: Root, pattern: string): string | null {
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    throw new Error(`Bad pattern: ${pattern}`);
  }
  const m = re.exec(clean(scope.text()));
  const v = clean(m?.[1] ?? m?.[0]);
  return v || null;
}

const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/[:\s]+$/, '');

/** The deepest element whose text starts with the caption; the value is
 * the rest of its text, else what follows it (siblings, then the parent's
 * siblings — a caption in its own grid cell). */
function byLabel(doc: HtmlDoc, scope: Root, label: string): string | null {
  const want = norm(label);
  if (!want) return null;
  const { $ } = doc;
  const matches = (el: DomNode) => {
    const t = norm($(el).text());
    return t === want || t.startsWith(`${want}:`) || t.startsWith(`${want} `);
  };
  // The first caption on the page, then down to its deepest element.
  let node: DomNode | undefined = scope
    .find('*')
    .toArray()
    .find((el) => matches(el));
  if (!node) return null;
  for (;;) {
    const child: DomNode | undefined = $(node)
      .children()
      .toArray()
      .find((el) => matches(el));
    if (!child) break;
    node = child;
  }
  const own = clean($(node).text());
  const rest = clean(own.slice(matchLength(own, label))).replace(/^:\s*/, '');
  if (rest) return rest;
  let cur: DomNode | null = node;
  for (let depth = 0; cur && depth < 3; depth += 1) {
    for (let sib = cur.nextSibling; sib; sib = sib.nextSibling) {
      const t = clean($(sib).text());
      if (t && t !== ':') return t.replace(/^:\s*/, '') || null;
    }
    cur = cur.parent;
  }
  return null;
}

/** Length of [label] at the start of [text] (case and colons ignored). */
function matchLength(text: string, label: string): number {
  const l = clean(label).replace(/:$/, '');
  const i = text.toLowerCase().indexOf(l.toLowerCase());
  if (i < 0) return 0;
  let end = i + l.length;
  while (end < text.length && /[:\s]/.test(text[end])) end += 1;
  return end;
}

/** The elements of [selector] (record rows / cards), or the whole page. */
export function scopes(doc: HtmlDoc, selector: string | undefined): Root[] {
  if (!selector?.trim()) return [doc.root];
  const css = selector.startsWith('css:') ? selector.slice(4) : selector;
  let found: Root;
  try {
    found = doc.root.find(css);
  } catch {
    throw new Error(`Bad CSS selector: ${css}`);
  }
  return found.toArray().map((el) => doc.$(el));
}

/** Hidden inputs of the page (ASP.NET __VIEWSTATE, anti-forgery tokens). */
export function hiddenInputs(doc: HtmlDoc): Record<string, string> {
  const out: Record<string, string> = {};
  doc.root.find('input[type="hidden" i]').each((_, el) => {
    const name = doc.$(el).attr('name');
    if (name) out[name] = doc.$(el).attr('value') ?? '';
  });
  return out;
}

/** Digits only, leading zeros dropped: "0012345" and "12,345" match. */
export function numberKey(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}
