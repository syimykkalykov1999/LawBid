'use client';

import { CaretDown } from '@phosphor-icons/react';
import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface OverflowTab {
  href: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; weight?: 'regular' | 'fill'; className?: string }>;
  count?: number;
}

const GAP = 4;
const PAD = 8;

function Badge({ n }: { n: number | undefined }) {
  if (!n) return null;
  return (
    <span className="grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] leading-5 font-semibold text-[#0b0b0d]">
      {n > 99 ? '99+' : n}
    </span>
  );
}

/**
 * Owner 2026-10-07 (picked option 1): page links in one even row that never
 * scrolls. Links that don't fit go into «Ещё ▾»; the open one always stays
 * in the row. Keep it outside the page's keyed wrapper so a click doesn't
 * rebuild it.
 */
export function OverflowTabs({ items, active, label, className }: { items: OverflowTab[]; active?: string; label?: string; className?: string }) {
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const sig = items.map((t) => `${t.href}:${t.label}:${t.count ?? 0}`).join('|');

  const measure = useCallback(() => {
    const row = box.current;
    const r = ruler.current;
    if (!row || !r) return;
    const els = [...r.querySelectorAll<HTMLElement>('[data-tab]')];
    const hrefs = els.map((e) => e.dataset.tab!);
    const widths = els.map((e) => e.offsetWidth);
    const avail = row.clientWidth - PAD;
    if (widths.reduce((a, w) => a + w + GAP, -GAP) <= avail) return setShown(hrefs);
    const room = avail - (r.querySelector<HTMLElement>('[data-more]')?.offsetWidth ?? 0) - GAP;
    const pick: number[] = [];
    let used = -GAP;
    for (let i = 0; i < widths.length && used + GAP + widths[i]! <= room; i++) {
      pick.push(i);
      used += GAP + widths[i]!;
    }
    const at = hrefs.indexOf(active ?? '');
    if (at >= 0 && !pick.includes(at)) {
      // The open link takes the last places of the row.
      while (pick.length && used + GAP + widths[at]! > room) used -= GAP + widths[pick.pop()!]!;
      pick.push(at);
    }
    setShown(pick.map((i) => hrefs[i]!));
  }, [active]);

  useLayoutEffect(() => {
    measure();
    const row = box.current;
    if (!row) return;
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [measure, sig]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !box.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = shown ? items.filter((t) => shown.includes(t.href)) : items;
  const hidden = shown ? items.filter((t) => !shown.includes(t.href)) : [];
  const hiddenCount = hidden.reduce((a, t) => a + (t.count ?? 0), 0);

  const link = (t: OverflowTab, ruler = false) => {
    const I = t.icon;
    const on = t.href === active;
    return (
      <Link
        key={t.href}
        href={t.href}
        scroll={false}
        data-tab={ruler ? t.href : undefined}
        tabIndex={ruler ? -1 : undefined}
        aria-current={on && !ruler ? 'page' : undefined}
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-[9px] px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
          on ? 'bg-surface text-heading shadow-sm ring-1 ring-gold/40' : 'text-muted hover:bg-surface/60 hover:text-ink',
        )}
      >
        {I ? <I size={16} weight={on ? 'fill' : 'regular'} className={on ? 'text-gold-600' : undefined} /> : null}
        {t.label}
        <Badge n={t.count} />
      </Link>
    );
  };
  const more = (n: number, ruler = false) => (
    <button
      type="button"
      data-more={ruler ? '' : undefined}
      tabIndex={ruler ? -1 : undefined}
      aria-haspopup={ruler ? undefined : 'menu'}
      aria-expanded={ruler ? undefined : open}
      onClick={() => setOpen((v) => !v)}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-[9px] border border-line bg-surface px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink transition-colors hover:border-gold/50',
        open && !ruler && 'border-gold/50',
      )}
    >
      Ещё {n}
      <Badge n={ruler ? 99 : hiddenCount} />
      <CaretDown size={13} weight="bold" className={cn('transition-transform', open && !ruler && 'rotate-180')} />
    </button>
  );

  return (
    <nav aria-label={label} className={cn('relative', className)}>
      {/* Invisible copy of every link: their widths decide what fits. */}
      <div ref={ruler} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex h-0 gap-1 overflow-hidden">
        {items.map((t) => link(t, true))}
        {more(99, true)}
      </div>
      <div ref={box} className="flex items-center gap-1 overflow-hidden rounded-[12px] border border-line bg-surface-2 p-1">
        {visible.map((t) => link(t))}
        {hidden.length ? <div className="ml-auto">{more(hidden.length)}</div> : null}
      </div>
      <AnimatePresence>
        {open && hidden.length ? (
          <m.div
            ref={menu}
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full right-0 z-30 mt-1.5 max-w-[calc(100vw-2rem)] min-w-56 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]"
          >
            {hidden.map((t) => {
              const I = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  scroll={false}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-2"
                >
                  {I ? <I size={16} className="shrink-0 text-muted" /> : null}
                  <span className="min-w-0 flex-1 break-words">{t.label}</span>
                  <Badge n={t.count} />
                </Link>
              );
            })}
          </m.div>
        ) : null}
      </AnimatePresence>
    </nav>
  );
}
