'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import type { Me } from '@/lib/hooks';
import { groupFor, sectionFor, tabsFor, type Section } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';
import { useNavCounts } from './use-nav-counts';

/** Owner 2026-10-05: the tabs of the current menu section — only the ones
 * this admin may open. One allowed tab → no tab row at all.
 * Owner 2026-10-07: every tab in sight without swiping. Wide screens wrap
 * all tabs into rows; phones show two rows and only what still doesn't fit
 * scrolls sideways. The strip lives outside the page (app-shell), so it
 * keeps its place on every tab click; the active tab is scrolled into view. */
export function SectionTabs({ me }: { me: Me | undefined }) {
  const pathname = usePathname();
  const counts = useNavCounts(me);
  const scroller = useRef<HTMLDivElement>(null);
  const tabs = me ? tabsFor(me, pathname) : [];
  const current = sectionFor(pathname)?.href;

  useLayoutEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    const left = el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: left - 16, behavior: box.dataset.ready ? 'smooth' : 'auto' });
    }
    box.dataset.ready = '1';
  }, [current, tabs.length]);

  if (tabs.length < 2) return null;
  const group = groupFor(pathname);
  const tab = (t: Section) => {
    const I = ICONS[t.icon];
    const on = t.href === current;
    const count = t.count ? counts[t.count] : undefined;
    return (
      <Link
        key={t.href}
        href={t.href}
        scroll={false}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-[9px] px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
          on ? 'bg-surface text-heading shadow-sm ring-1 ring-gold/40' : 'text-muted hover:bg-surface/60 hover:text-ink',
        )}
      >
        {I ? <I size={16} weight={on ? 'fill' : 'regular'} className={on ? 'text-gold-600' : undefined} /> : null}
        {t.label}
        {count ? (
          <span className="grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] leading-5 font-semibold text-[#0b0b0d]">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </Link>
    );
  };
  const [top, bottom] = splitRows(tabs);
  return (
    <nav aria-label={group?.label} className="mb-6">
      {/* Phones: two rows, the rest scrolls sideways. */}
      <div ref={scroller} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max flex-col gap-1 rounded-[12px] border border-line bg-surface-2 p-1">
          <div className="flex gap-1">{top.map(tab)}</div>
          {bottom.length ? <div className="flex gap-1">{bottom.map(tab)}</div> : null}
        </div>
      </div>
      {/* Wider screens: every tab in sight, wrapped into rows. */}
      <div className="hidden flex-wrap gap-1 rounded-[12px] border border-line bg-surface-2 p-1 sm:flex">{tabs.map(tab)}</div>
    </nav>
  );
}

/** Two rows of about equal width, in reading order; three tabs or fewer stay in one row. */
function splitRows(tabs: Section[]): [Section[], Section[]] {
  if (tabs.length <= 3) return [tabs, []];
  const w = tabs.map((t) => t.label.length + 6 + (t.count ? 3 : 0));
  const half = w.reduce((a, b) => a + b, 0) / 2;
  let sum = 0;
  let cut = 0;
  while (cut < tabs.length - 1 && sum + w[cut]! / 2 < half) sum += w[cut++]!;
  return [tabs.slice(0, cut), tabs.slice(cut)];
}
