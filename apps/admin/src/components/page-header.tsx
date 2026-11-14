'use client';

import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { type QueryClient, QueryClientContext } from '@tanstack/react-query';
import * as m from 'motion/react-m';
import { useCallback, useContext, useSyncExternalStore } from 'react';
import { useDeskEmbed } from '@/components/desk/embed';
import { Button } from '@/components/ui/button';
import { errorDetail } from '@/lib/api/client';

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  // Staff package T8: on the worker's desk the tab is the title; only the
  // page's own buttons stay.
  const embedded = useDeskEmbed();
  if (embedded) {
    return actions ? <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{actions}</div> : null;
  }
  return (
    <m.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-7 sm:gap-4"
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-600">{eyebrow}</div>
        ) : null}
        <h1 className="font-serif text-[24px] leading-tight font-semibold tracking-tight text-heading sm:text-[32px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 max-sm:[&>*]:flex-1 sm:w-auto">{actions}</div> : null}
    </m.div>
  );
}

/** The page's failed reads: active queries whose last fetch failed. */
const failedQueries = (client: QueryClient) =>
  client.getQueryCache().findAll({ type: 'active', predicate: (q) => q.state.status === 'error' });

/**
 * «2:1» — how many active reads failed and how many of them are being
 * retried now (a primitive, so useSyncExternalStore re-renders only on a
 * real change).
 */
function useFailedReads(client: QueryClient | undefined): { failed: number; retrying: boolean } {
  const subscribe = useCallback((cb: () => void) => (client ? client.getQueryCache().subscribe(cb) : () => {}), [client]);
  const snap = useSyncExternalStore(
    subscribe,
    () => {
      if (!client) return '0:0';
      const list = failedQueries(client);
      return `${list.length}:${list.filter((q) => q.state.fetchStatus === 'fetching').length}`;
    },
    () => '0:0',
  );
  const [failed, retrying] = snap.split(':').map(Number);
  return { failed: failed ?? 0, retrying: (retrying ?? 0) > 0 };
}

/**
 * The error state used by every page. Detective D1-5 (13.11): the text says
 * «попробуйте ещё раз», so the note carries the button, as Stripe's
 * dashboard and Linear do on a failed load. `onRetry` repeats the page's own
 * request; without it the button re-reads the reads of this screen that
 * failed (TanStack `refetchQueries`, active + errored only) and is shown
 * only when there are any — an action error (a refused save) has no button.
 */
export function ErrorNote({ text, onRetry }: { text: string | null | undefined; onRetry?: () => unknown }) {
  const client = useContext(QueryClientContext);
  const { failed, retrying } = useFailedReads(client);
  if (!text) return null;
  const retry = onRetry
    ? onRetry
    : failed > 0 && client
      ? () => client.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' })
      : null;
  return (
    <m.p
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 flex items-start gap-2 rounded-xl border border-transparent bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
    >
      <WarningCircle size={18} className="mt-px shrink-0" />
      <span className="min-w-0 flex-1" title={errorDetail(text)}>{text}</span>
      {retry ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={retrying}
          disabled={retrying}
          className="-my-1 shrink-0 text-danger hover:bg-danger/10"
          onClick={() => void retry()}
        >
          {retrying ? null : <ArrowClockwise size={14} />}
          Повторить
        </Button>
      ) : null}
    </m.p>
  );
}

/** Section title inside a page. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-9 mb-3.5 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{children}</h2>
      {action}
    </div>
  );
}
