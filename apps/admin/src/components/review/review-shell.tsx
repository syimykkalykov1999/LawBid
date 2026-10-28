'use client';

import { ArrowRight, CheckCircle, Keyboard } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { SKIP_REASONS } from '@/lib/desk';
import { dialogOnScreen, reviewKeyOf, type ReviewKey } from '@/lib/review-flow';
import type { ReviewFlow } from './use-review-flow';

export interface ReviewAction {
  id: string;
  label: string;
  variant?: 'gold' | 'danger' | 'outline' | 'ghost' | 'default';
  /** The one-key shortcut that runs it. */
  shortcut?: ReviewKey;
  disabled?: boolean;
  run: () => void;
}

/**
 * Owner 2026-10-28: the one frame of every «…и дальше» screen: the title,
 * the buttons (sticky on top while the person scrolls), «Пропустить» with a
 * reason when the lease engine hands the work, the shortcut hint, and the
 * empty / loading states. The page puts the item itself in [children].
 */
export function ReviewShell<T>({
  eyebrow,
  title,
  subtitle,
  flow,
  actions,
  busy,
  backHref,
  backLabel,
  emptyText,
  hint,
  loading,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  flow: ReviewFlow<T>;
  actions: ReviewAction[];
  /** A decision is on its way: every button waits. */
  busy: boolean;
  backHref: string;
  backLabel: string;
  emptyText: string;
  hint: readonly { key: string; text: string }[];
  /** The item's card is still loading. */
  loading: boolean;
  children: React.ReactNode;
}) {
  const [skipOpen, setSkipOpen] = useState(false);
  const locked = busy || flow.finding;
  const skip = () => {
    if (locked) return;
    if (flow.leaseMode) setSkipOpen((v) => !v);
    else void flow.skip();
  };

  // The shortcuts: the latest buttons, one listener.
  const keys = useRef({ actions, skip, locked });
  keys.current = { actions, skip, locked };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = reviewKeyOf(e, dialogOnScreen());
      if (!k || keys.current.locked) return;
      if (k === 'next') {
        e.preventDefault();
        keys.current.skip();
        return;
      }
      const a = keys.current.actions.find((x) => x.shortcut === k && !x.disabled);
      if (!a) return;
      e.preventDefault();
      a.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const item = flow.current;
  useEffect(() => setSkipOpen(false), [item]);

  const head = (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-600">{eyebrow}</div>
        <h1 className="truncate font-serif text-[22px] leading-tight font-semibold text-heading sm:text-[28px]">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        {flow.doneCount > 0 ? (
          <span className="inline-flex items-center gap-1" data-testid="review-done-count">
            <CheckCircle size={15} className="text-success" /> за сессию: {flow.doneCount}
          </span>
        ) : null}
        <Link href={backHref} className="text-gold-600 hover:underline">
          {backLabel}
        </Link>
      </div>
    </div>
  );

  if (!flow.current) {
    return (
      <div data-testid="review-screen">
        {head}
        {flow.finding || !flow.empty ? (
          <Skeleton className="h-72 w-full rounded-[var(--radius-lg)]" />
        ) : (
          <EmptyState
            title={flow.note ?? emptyText}
            action={
              <Button variant="outline" size="sm" onClick={() => void flow.refresh()}>
                Проверить ещё раз
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div data-testid="review-screen" className="pb-28">
      {head}
      {loading ? <Skeleton className="h-72 w-full rounded-[var(--radius-lg)]" /> : children}
      {/* Owner 2026-10-28: the buttons stay on ONE row from 1280 px (xl) and
          wrap only on narrow screens; the bar sticks to the bottom. */}
      <Card className="sticky bottom-2 z-20 mt-4 p-2.5 shadow-pop" data-testid="review-actions">
        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap" data-testid="review-action-row">
          <Button size="sm" variant="ghost" className="shrink-0 whitespace-nowrap" disabled={locked} onClick={skip}>
            <ArrowRight size={14} weight="bold" /> Пропустить
            <Kbd>N</Kbd>
          </Button>
          {actions.map((a) => (
            <Button key={a.id} size="sm" variant={a.variant ?? 'outline'} className="shrink-0 whitespace-nowrap" disabled={locked || a.disabled} onClick={a.run}>
              {a.label}
              {a.shortcut ? <Kbd>{shortcutLetter(a.shortcut)}</Kbd> : null}
            </Button>
          ))}
          <span className="ml-auto hidden min-w-0 items-center gap-x-3 truncate text-xs text-faint 2xl:inline-flex" data-testid="review-hint">
            <Keyboard size={14} className="shrink-0" />
            {hint.map((h) => (
              <span key={h.key} className="whitespace-nowrap">
                <kbd className="rounded border border-line px-1 font-mono">{h.key}</kbd> {h.text}
              </span>
            ))}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-faint 2xl:hidden" aria-hidden>
          {hint.map((h) => (
            <span key={h.key} className="whitespace-nowrap">
              <kbd className="rounded border border-line px-1 font-mono">{h.key}</kbd> {h.text}
            </span>
          ))}
        </div>
        {skipOpen ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2" role="group" aria-label="Причина пропуска">
            <span className="text-sm text-muted">Почему пропускаете?</span>
            {SKIP_REASONS.map((r) => (
              <Button key={r.value} variant="ghost" size="sm" disabled={locked} onClick={() => void flow.skip(r.value)}>
                {r.label}
              </Button>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded border border-current/30 px-1 font-mono text-[10px] opacity-70">{children}</kbd>;
}

function shortcutLetter(k: ReviewKey): string {
  return k === 'approve' ? 'A' : k === 'reject' ? 'R' : 'N';
}
