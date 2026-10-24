import { Fragment } from 'react';
import { parseMarkdown, type Block, type Inline } from '@/lib/markdown';

function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <Fragment key={i}>{n.v}</Fragment>;
          case 'bold':
            return (
              <strong key={i} className="font-semibold text-heading">
                <Inlines c={n.c} />
              </strong>
            );
          case 'em':
            return (
              <em key={i}>
                <Inlines c={n.c} />
              </em>
            );
          case 'code':
            return (
              <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] break-words">
                {n.v}
              </code>
            );
          case 'link':
            return (
              <a
                key={i}
                href={n.href}
                className="text-gold-500 underline underline-offset-2"
                {...(n.href.startsWith('#') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              >
                <Inlines c={n.c} />
              </a>
            );
        }
      })}
    </>
  );
}

const HEADING_CLASS = {
  1: 'mt-2 mb-4 font-serif text-[28px] font-semibold text-heading',
  2: 'mt-10 mb-3 scroll-mt-20 border-b border-line pb-2 font-serif text-[22px] font-semibold text-heading',
  3: 'mt-7 mb-2 scroll-mt-20 text-lg font-semibold text-heading',
  4: 'mt-5 mb-1 scroll-mt-20 text-sm font-semibold uppercase tracking-wide text-muted',
} as const;

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'heading': {
      const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3' | 'h4';
      return (
        <Tag id={b.id} className={HEADING_CLASS[b.level]}>
          <Inlines c={b.c} />
        </Tag>
      );
    }
    case 'p':
      return (
        <p className="my-3 text-sm leading-relaxed text-ink">
          <Inlines c={b.c} />
        </p>
      );
    case 'ul':
      return (
        <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {b.items.map((it, i) => (
            <li key={i}>
              <Inlines c={it} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {b.items.map((it, i) => (
            <li key={i}>
              <Inlines c={it} />
            </li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote className="my-4 rounded-r-lg border-l-4 border-gold bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink">
          <Inlines c={b.c} />
        </blockquote>
      );
    case 'code':
      return <pre className="my-3 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed text-ink">{b.v}</pre>;
    case 'hr':
      return <hr className="my-8 border-line" />;
    case 'table':
      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} className="px-3 py-2 font-semibold">
                    <Inlines c={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-line align-top">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 text-ink">
                      <Inlines c={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Renders the owner-edited Markdown as React elements, never as raw HTML. */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <article className="max-w-3xl">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </article>
  );
}
