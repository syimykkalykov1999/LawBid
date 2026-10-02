'use client';

import { Envelope, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Tabs } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/** Mail clients show emails on paper-white; keep that in both admin themes
 * (inserted after a doctype so the document stays in standards mode). */
const PAPER = '<meta name="color-scheme" content="light"><style>html{background:#fff;color:#111}</style>';
function withPaper(html: string): string {
  return html.replace(/^(\s*<!doctype[^>]*>)?/i, (m) => `${m}${PAPER}`);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html?: string | null;
  unknownVariables?: string[];
}

/**
 * Inbox-style preview: subject line, HTML in a fully sandboxed iframe
 * (srcDoc, sandbox="" — no scripts, no same-origin), plain text tab,
 * warnings for unknown placeholders.
 */
export function EmailPreview({
  email,
  loading,
  label,
  error,
}: {
  email: RenderedEmail | null;
  loading?: boolean;
  label?: string;
  error?: string | null;
}) {
  const [view, setView] = useState<'html' | 'text'>('html');
  const hasHtml = !!email?.html;
  const shown = hasHtml ? view : 'text';
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
          <Envelope size={14} weight="light" /> Предпросмотр
          {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
        </div>
        {hasHtml ? (
          <Tabs<'html' | 'text'>
            size="sm"
            value={shown}
            onChange={setView}
            items={[
              { value: 'html', label: 'HTML' },
              { value: 'text', label: 'Текст' },
            ]}
          />
        ) : null}
      </div>
      {email ? (
        <>
          <div className="space-y-1 border-b border-line px-4 py-3">
            {label ? <div className="text-[11px] text-faint">{label}</div> : null}
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-faint">Тема:</span>
              <span className="font-medium break-words text-heading">{email.subject || '—'}</span>
            </div>
            <div className="text-xs text-faint">От: LawBid · с примерами значений</div>
          </div>
          {email.unknownVariables?.length ? (
            <div className="flex items-start gap-2 border-b border-line bg-warning-soft px-4 py-2.5 text-xs text-warning">
              <Warning size={15} weight="light" className="mt-px shrink-0" />
              <span>
                Неизвестные переменные — в письме будут пустыми:{' '}
                {email.unknownVariables.map((v) => (
                  <code key={v} className="mr-1 rounded bg-surface px-1 font-mono">{`{{${v}}}`}</code>
                ))}
              </span>
            </div>
          ) : null}
          <div className={cn('transition-opacity', loading && 'opacity-60')}>
            {shown === 'html' ? (
              <iframe
                title="Предпросмотр письма"
                sandbox=""
                srcDoc={withPaper(email.html ?? '')}
                className="block h-[520px] w-full bg-surface"
              />
            ) : (
              <pre className="max-h-[520px] min-h-48 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-ink">
                {email.text}
              </pre>
            )}
          </div>
        </>
      ) : error ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{error}</div>
      ) : (
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-64" />
        </div>
      )}
    </Card>
  );
}
