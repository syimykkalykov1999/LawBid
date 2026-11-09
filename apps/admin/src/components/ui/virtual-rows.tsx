'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Long admin lists (journals, users, cases, moderation queues) render only
 * the rows in and around the window — `@tanstack/react-virtual` (MIT), the
 * window virtualizer with measured row heights, the way its "window" example
 * does it. The look stays: the page scrolls as before, the table keeps its
 * header and columns; two spacer rows hold the height of the rows not drawn.
 *
 * Below VIRTUAL_ROWS_MIN rows (the first page of every list) nothing changes:
 * every row is rendered as before, so short lists and their tests are
 * untouched; the virtualizer starts once «Показать ещё» has grown the list.
 */
export const VIRTUAL_ROWS_MIN = 40;

export interface VirtualRowProps {
  ref: (el: HTMLTableRowElement | null) => void;
  'data-index': number;
}

export function VirtualRows<T>({
  rows,
  estimateSize = 56,
  overscan = 8,
  colSpan = 1,
  min = VIRTUAL_ROWS_MIN,
  children,
}: {
  rows: T[];
  /** A typical row height in px (measured afterwards). */
  estimateSize?: number;
  overscan?: number;
  /** Columns of the table (the spacer cells span them). */
  colSpan?: number;
  min?: number;
  /** `i` is the stagger index inside the drawn window; spread `props` on the <tr>. */
  children: (row: T, i: number, props?: VirtualRowProps) => React.ReactNode;
}) {
  if (rows.length < min) return <>{rows.map((r, i) => children(r, i))}</>;
  return (
    <Virtualized rows={rows} estimateSize={estimateSize} overscan={overscan} colSpan={colSpan}>
      {children}
    </Virtualized>
  );
}

function Virtualized<T>({
  rows,
  estimateSize,
  overscan,
  colSpan,
  children,
}: {
  rows: T[];
  estimateSize: number;
  overscan: number;
  colSpan: number;
  children: (row: T, i: number, props?: VirtualRowProps) => React.ReactNode;
}) {
  const anchor = useRef<HTMLTableRowElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el) return;
    setScrollMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
  }, []);
  const v = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin,
  });
  const items = v.getVirtualItems();
  const first = items[0];
  const last = items[items.length - 1];
  const top = first ? first.start - v.options.scrollMargin : 0;
  const bottom = last ? v.getTotalSize() - (last.end - v.options.scrollMargin) : 0;
  return (
    <>
      <tr ref={anchor} aria-hidden className="h-0" />
      {top > 0 ? <Spacer height={top} colSpan={colSpan} /> : null}
      {items.map((it) =>
        children(rows[it.index], it.index - (first?.index ?? 0), {
          ref: v.measureElement,
          'data-index': it.index,
        }),
      )}
      {bottom > 0 ? <Spacer height={bottom} colSpan={colSpan} /> : null}
    </>
  );
}

function Spacer({ height, colSpan }: { height: number; colSpan: number }) {
  return (
    <tr aria-hidden className="pointer-events-none !bg-transparent">
      <td colSpan={colSpan} className="border-0 p-0" style={{ height }} />
    </tr>
  );
}
