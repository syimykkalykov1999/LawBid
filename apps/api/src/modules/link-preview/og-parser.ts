import { load } from 'cheerio';

export interface ParsedPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 300;
const SITE_MAX = 100;
/** Without a closing </head> only the start of the page is read. */
const HEAD_FALLBACK_BYTES = 128 * 1024;

// Control characters, zero-width and bidi-override marks (spoofing).
/* eslint-disable no-control-regex */
const CONTROL = new RegExp(
  '[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e]',
  'g',
);
/* eslint-enable no-control-regex */

function clean(raw: string | undefined, max: number): string | null {
  if (!raw) return null;
  const s = raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Only the <head> matters; cut the page there so a 1 MB body costs nothing. */
function headOf(html: string): string {
  const m = /<\/head\s*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length);
  return html.slice(0, HEAD_FALLBACK_BYTES);
}

function absoluteImage(raw: string | undefined, base: URL): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    const s = u.toString();
    return s.length <= 2048 ? s : null;
  } catch {
    return null;
  }
}

/**
 * Open Graph / Twitter card / plain meta of a page (what Telegram, Slack
 * and Facebook read). cheerio (parse5) is a spec-compliant, maintained
 * parser; it never executes anything. [base] is the final URL, used to
 * resolve relative image paths.
 */
export function parsePreview(html: string, base: URL): ParsedPreview {
  const $ = load(headOf(html));
  const meta = (...names: string[]): string | undefined => {
    for (const name of names) {
      const el = $('meta')
        .filter((_, e) => {
          const a = $(e).attr('property') ?? $(e).attr('name') ?? '';
          return a.toLowerCase() === name;
        })
        .first();
      const content = el.attr('content');
      if (content && content.trim()) return content;
    }
    return undefined;
  };
  const title =
    clean(meta('og:title', 'twitter:title'), TITLE_MAX) ??
    clean($('title').first().text(), TITLE_MAX);
  const description = clean(
    meta('og:description', 'twitter:description', 'description'),
    DESCRIPTION_MAX,
  );
  const imageUrl = absoluteImage(
    meta('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image'),
    base,
  );
  const siteName =
    clean(meta('og:site_name', 'application-name'), SITE_MAX) ??
    clean(base.hostname.replace(/^www\./i, ''), SITE_MAX);
  return { title, description, imageUrl, siteName };
}
