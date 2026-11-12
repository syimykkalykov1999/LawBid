'use client';

import { DotsThreeVertical } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  /** Hint on hover (why an item is greyed out). */
  title?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * «⋯» button with a small drop-down of actions (cards and table rows).
 * Clicks never bubble to the card underneath; Esc or a click outside closes.
 */
export function RowMenu({ items, label = 'Действия', text, className }: { items: MenuItem[]; label?: string; text?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  if (items.length === 0) return null;
  return (
    <div ref={ref} className={cn('relative', className)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          text
            ? 'inline-flex h-8 items-center gap-1 rounded-[10px] border border-line-strong bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-gold/60 hover:bg-surface-2 pointer-coarse:h-10'
            : 'grid h-8 w-8 place-items-center rounded-[10px] text-muted transition-colors hover:bg-surface-2 hover:text-ink'
        }
      >
        {text ? <span>{text}</span> : null}
        <DotsThreeVertical size={text ? 14 : 18} weight="bold" />
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute top-9 right-0 z-30 max-w-[calc(100vw-2rem)] min-w-44 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]"
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                title={it.title}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45',
                  it.danger ? 'text-danger' : 'text-ink',
                )}
              >
                {it.icon ? <it.icon size={16} className="shrink-0" /> : null}
                <span className="min-w-0 break-words">{it.label}</span>
              </button>
            ))}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
