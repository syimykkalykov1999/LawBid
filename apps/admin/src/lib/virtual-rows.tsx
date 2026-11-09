'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * SPEED_MATRIX 2026-11-09 §3 №12 (admin, long journals): only the rows
 * around the viewport are in the DOM; the rest is two invisible spacer
 * rows of the right height, so the page scrolls, looks and measures
 * exactly as before. TanStack Virtual 3 (MIT), its window-scroll mode
 * (`useWindowVirtualizer`) with measured row heights — the table keeps
 * its layout, no scroll box is added. Under [threshold] rows nothing
 * changes: every row renders as it always did.
 *
 * Use: `const v = useVirtualRows(rows)`; `<tbody ref={v.bodyRef}>`,
 * `<SpacerRow height={v.paddingTop} />`, then `v.items.map(({ row,
 * index, rowProps }) => <MotionRow key=… {...rowProps}>…)`, then
 * `<SpacerRow height={v.paddingBottom} />`.
 */
export function useVirtualRows<T>(
  rows: readonly T[],
  { estimate = 56, overscan = 12, threshold = 60 }: { estimate?: number; overscan?: number; threshold?: number } = {},
) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const seen = useRef(new Set<number>());
  const active = rows.length > threshold;

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !active) return;
    setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
  }, [active, rows.length]);

  const virtualizer = useWindowVirtualizer({
    count: active ? rows.length : 0,
    estimateSize: () => estimate,
    overscan,
    scrollMargin,
  });

  const rowProps = (index: number) => {
    const first = !seen.current.has(index);
    seen.current.add(index);
    return {
      ref: active ? virtualizer.measureElement : undefined,
      'data-index': index,
      animateIn: first,
    };
  };

  if (!active) {
    return {
      bodyRef,
      items: rows.map((row, index) => ({ row, index, rowProps: rowProps(index) })),
      paddingTop: 0,
      paddingBottom: 0,
      virtual: false,
    };
  }
  const items = virtualizer.getVirtualItems();
  const start = items.length ? items[0].start - virtualizer.options.scrollMargin : 0;
  const end = items.length ? virtualizer.getTotalSize() - (items[items.length - 1].end - virtualizer.options.scrollMargin) : 0;
  return {
    bodyRef,
    items: items.map((v) => ({ row: rows[v.index], index: v.index, rowProps: rowProps(v.index) })),
    paddingTop: Math.max(0, start),
    paddingBottom: Math.max(0, end),
    virtual: true,
  };
}

/** The invisible row that stands in for the rows above / below the viewport. */
export function SpacerRow({ height }: { height: number }) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden style={{ height }}>
      <td colSpan={99} className="border-0 p-0" />
    </tr>
  );
}
