'use client';

import { ArrowRight, MagnifyingGlass, MoonStars, Sun, User } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Me } from '@/lib/hooks';
import { can, sectionsFor } from '@/lib/rbac';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** ⌘K / Ctrl+K: jump to any section, find a user, switch the theme. */
export function CommandPalette({ me, open, setOpen }: { me: Me | undefined; open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const { resolved, toggle } = useTheme();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const s = q.trim().toLowerCase();
    const sections: Item[] = (me ? sectionsFor(me) : [])
      .filter((x) => !s || x.label.toLowerCase().includes(s) || x.hint?.toLowerCase().includes(s))
      .map((x) => {
        const I = ICONS[x.icon];
        return { id: x.href, label: x.label, hint: x.hint, icon: I ? <I size={18} weight="light" /> : null, run: go(x.href) };
      });
    const extra: Item[] = [];
    if (s && me && can(me, 'users')) {
      extra.push({
        id: 'find-user',
        label: `Найти пользователя «${q.trim()}»`,
        hint: 'имя, email, телефон, @username',
        icon: <User size={18} weight="light" />,
        run: go(`/users?q=${encodeURIComponent(q.trim())}`),
      });
    }
    if (!s || 'тема ночь день theme'.includes(s)) {
      extra.push({
        id: 'theme',
        label: resolved === 'dark' ? 'Включить дневную тему' : 'Включить ночную тему',
        icon: resolved === 'dark' ? <Sun size={18} weight="light" /> : <MoonStars size={18} weight="light" />,
        run: () => {
          toggle();
          setOpen(false);
        },
      });
    }
    return [...extra.filter((e) => e.id === 'find-user'), ...sections, ...extra.filter((e) => e.id !== 'find-user')];
  }, [q, me, resolved, router, setOpen, toggle]);

  useEffect(() => setIdx(0), [q]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[65] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-[#05060a]/50 backdrop-blur-[6px]" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="relative w-full max-w-xl overflow-hidden rounded-[var(--radius-xl)] border border-line bg-elevated shadow-pop"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <MagnifyingGlass size={18} className="text-faint" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setIdx((i) => Math.min(i + 1, items.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    items[idx]?.run();
                  } else if (e.key === 'Escape') {
                    setOpen(false);
                  }
                }}
                placeholder="Раздел, пользователь или команда…"
                className="h-14 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-faint">Esc</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {items.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted">Ничего не найдено</div>
              ) : (
                items.map((it, i) => (
                  <button
                    key={it.id}
                    type="button"
                    onMouseEnter={() => setIdx(i)}
                    onClick={it.run}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                      i === idx ? 'bg-accent-soft text-ink' : 'text-muted',
                    )}
                  >
                    <span className={cn(i === idx ? 'text-gold-600' : 'text-faint')}>{it.icon}</span>
                    <span className="flex-1">
                      <span className="text-ink">{it.label}</span>
                      {it.hint ? <span className="ml-2 text-xs text-faint">{it.hint}</span> : null}
                    </span>
                    {i === idx ? <ArrowRight size={14} className="text-gold-600" /> : null}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
