'use client';

import { LinkifyIt } from 'linkify-it';
import { Fragment, useMemo } from 'react';

/**
 * Detective D1-13 (13.11): links in a support message open with one click.
 * Recognition is linkify-it (MIT, markdown-it — the linkifier of
 * markdown-it and of most chat UIs), used as is; ftp: is switched off. Only
 * http(s) and mailto links become <a> (linkify-it never yields javascript:
 * or data:, the check is a second lock); everything stays React text, no
 * innerHTML. A user's link opens in a new tab with noopener noreferrer
 * nofollow, so the page it opens cannot reach the admin tab.
 */
const linkify = new LinkifyIt().add('ftp:', null);

const SAFE = /^(https?:\/\/|mailto:)/i;

export function LinkifiedText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const matches = linkify.match(text) ?? [];
    const out: Array<{ t: string; href?: string }> = [];
    let at = 0;
    for (const m of matches) {
      if (!SAFE.test(m.url)) continue;
      if (m.index > at) out.push({ t: text.slice(at, m.index) });
      out.push({ t: m.text, href: m.url });
      at = m.lastIndex;
    }
    if (at < text.length) out.push({ t: text.slice(at) });
    return out;
  }, [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.href ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-gold-600 underline underline-offset-2 hover:text-gold"
          >
            {p.t}
          </a>
        ) : (
          <Fragment key={i}>{p.t}</Fragment>
        ),
      )}
    </>
  );
}
