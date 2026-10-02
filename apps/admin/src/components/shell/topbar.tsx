'use client';

import { CaretDown, List, MagnifyingGlass, SignOut } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Me } from '@/lib/hooks';
import { ROLE_LABEL, sectionFor } from '@/lib/rbac';
import { ThemeChoice, ThemeToggle } from './theme-toggle';

export function Topbar({ me, onMenu, onSearch }: { me: Me | undefined; onMenu: () => void; onSearch: () => void }) {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const signOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    qc.clear();
    router.replace('/login');
  };

  const initials = (me?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-canvas/75 px-4 backdrop-blur-xl lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Меню"
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
      >
        <List size={20} />
      </button>
      <div className="min-w-0 flex-1 truncate text-sm text-muted">
        <span className="hidden sm:inline">LawBid</span>
        {section && section.href !== '/' ? (
          <>
            <span className="mx-2 hidden text-faint sm:inline">/</span>
            <span className="font-medium text-ink">{section.label}</span>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="hidden h-9 w-72 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-faint transition-colors hover:border-gold/50 md:flex"
      >
        <MagnifyingGlass size={16} />
        <span className="flex-1 text-left">Поиск и переход…</span>
        <kbd className="rounded-md border border-line px-1.5 text-[10px]">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Поиск"
        className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-muted md:hidden"
      >
        <MagnifyingGlass size={18} />
      </button>
      <ThemeToggle />
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface pr-2 pl-1 text-sm transition-colors hover:border-gold/50"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-navy to-[#1b3170] text-[11px] font-semibold text-gold-300">
            {initials}
          </span>
          <CaretDown size={12} className="text-faint" />
        </button>
        <AnimatePresence>
          {menu ? (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl border border-line bg-elevated p-2 shadow-pop"
            >
              <div className="px-3 py-2">
                <div className="truncate text-sm font-medium text-ink">{me?.email}</div>
                <div className="text-xs text-gold-600">{me ? ROLE_LABEL[me.role] : ''}</div>
              </div>
              <div className="px-1 py-2">
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Тема</div>
                <ThemeChoice />
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger transition-colors hover:bg-danger-soft"
              >
                <SignOut size={16} /> Выйти
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}
