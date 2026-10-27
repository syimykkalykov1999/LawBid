'use client';

import { CaretDown, List, MagnifyingGlass, ShieldCheck, SignOut } from '@phosphor-icons/react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Me } from '@/lib/hooks';
import { ROLE_LABEL, WORKSPACE_HEAD_LABEL, WORKSPACE_LABEL, groupFor, navModeFor, sectionFor } from '@/lib/rbac';
import { CountrySwitcher } from './country-switcher';
import { ThemeChoice, ThemeToggle } from './theme-toggle';

export function Topbar({ me, onMenu, onSearch }: { me: Me | undefined; onMenu: () => void; onSearch: () => void }) {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  // Staff package T2: a worker of a workspace has no left menu to open and
  // no menu section: the crumb names their workspace instead.
  const desk = navModeFor(me) === 'desk';
  const group = desk ? (me?.workspace ? { label: WORKSPACE_LABEL[me.workspace] } : undefined) : groupFor(pathname, me);
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
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-canvas/75 px-3 pt-[env(safe-area-inset-top)] sm:h-16 sm:gap-3 sm:px-4 backdrop-blur-xl lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Меню"
        className={`${desk ? 'hidden' : 'hidden sm:block lg:hidden'} rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink`}
      >
        <List size={20} />
      </button>
      <div className="min-w-0 flex-1 truncate text-sm text-muted">
        <span className="hidden sm:inline">LawBid</span>
        {section && section.href === '/' ? <span className="font-medium text-ink sm:hidden">LawBid</span> : null}
        {section && section.href !== '/' ? (
          <>
            <span className="mx-2 hidden text-faint sm:inline">/</span>
            {group && group.label !== section.label ? (
              <>
                <span className="hidden sm:inline">{group.label}</span>
                <span className="mx-2 hidden text-faint sm:inline">/</span>
              </>
            ) : null}
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
        className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-muted md:hidden"
      >
        <MagnifyingGlass size={18} />
      </button>
      <CountrySwitcher me={me} />
      <ThemeToggle />
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setMenu((o) => !o)}
          className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface pr-2 pl-1 sm:h-9 text-sm transition-colors hover:border-gold/50"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-navy to-[#1b3170] text-[11px] font-semibold text-gold-300">
            {initials}
          </span>
          <CaretDown size={12} className="text-faint" />
        </button>
        <AnimatePresence>
          {menu ? (
            <m.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 mt-2 w-[min(16rem,calc(100vw-1.5rem))] origin-top-right rounded-2xl border border-line bg-elevated p-2 shadow-pop"
            >
              <div className="px-3 py-2">
                <div className="truncate text-sm font-medium text-ink">{me?.email}</div>
                <div className="text-xs text-gold-600">
                  {me ? (desk && me.workspace ? `${WORKSPACE_LABEL[me.workspace]}${me.workspaceHead ? ` · ${WORKSPACE_HEAD_LABEL}` : ''}` : ROLE_LABEL[me.role]) : ''}
                </div>
              </div>
              <div className="px-1 py-2">
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Тема</div>
                <ThemeChoice />
              </div>
              <Link
                href="/profile"
                onClick={() => setMenu(false)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-2"
              >
                <ShieldCheck size={16} /> Профиль и безопасность
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger transition-colors hover:bg-danger-soft"
              >
                <SignOut size={16} /> Выйти
              </button>
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}
