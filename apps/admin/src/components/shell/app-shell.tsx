'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { deskHome, outsideDesk } from '@/lib/desk';
import { useDeskSettings } from '@/lib/desk-data';
import { useMe } from '@/lib/hooks';
import { canOpen, navModeFor, sectionFor } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { BottomNav } from './bottom-nav';
import { DeskTabs } from './desk-tabs';
import { SectionTabs } from './section-tabs';
import { StepUpHost } from './step-up-host';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const COLLAPSE_KEY = 'lawbid-admin-sidebar';

// ⌘K palette: its code (all sections, icons, search) loads on the first
// ⌘K / search click instead of with every page (next/dynamic, Next.js docs
// «Lazy Loading»: load client components only when they are needed).
const CommandPalette = dynamic(() => import('./command-palette').then((m) => m.CommandPalette), { ssr: false });

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  // Until the palette is mounted the shell listens for ⌘K itself; after
  // that the palette's own listener takes over (one listener at a time).
  const [paletteMounted, setPaletteMounted] = useState(false);
  const openPalette = () => {
    setPaletteMounted(true);
    setPalette(true);
  };
  useEffect(() => {
    if (paletteMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteMounted(true);
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteMounted]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => setDrawer(false), [pathname]);
  // Owner 2026-10-05: a section without the right doesn't exist for this
  // admin — not in the menu, and a typed URL shows "not found".
  // Staff package T2: while workspaces are on, a worker of mass / finance
  // has no left menu, no drawer and no bottom bar — one page with tabs.
  const desk = navModeFor(me) === 'desk';
  // Staff package T8: with `staff.desk_enabled` the tabs are the desk
  // (/desk/<role>) and the rest of the workspace is not reachable.
  const router = useRouter();
  const deskSettings = useDeskSettings(desk ? me : undefined);
  const deskOn = desk && deskSettings.on('staff.desk_enabled');
  const home = deskOn ? deskHome(me, true) : null;
  const toDesk = !!home && (pathname === '/' || pathname === '/workspace');
  useEffect(() => {
    if (toDesk && home) router.replace(home);
  }, [toDesk, home, router]);
  const hidden = (!!me && !!sectionFor(pathname) && !canOpen(me, pathname)) || (deskOn && outsideDesk(me, pathname, true));
  // Sweep C-c14 (QS P3): until `me` is known a gated page is not shown, so
  // an owner-only page never flashes before «Такой страницы нет».
  const waiting = !me && !!sectionFor(pathname);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="relative min-h-screen">
      <StepUpHost />
      {/* Ambient brand glow, like the site's hero. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[420px] w-[720px] rounded-full bg-gold/[0.07] blur-[120px] dark:bg-gold/[0.06]" />
        <div className="absolute -right-40 bottom-0 h-[380px] w-[560px] rounded-full bg-brand-navy/[0.06] blur-[120px] dark:bg-[#1b3170]/25" />
      </div>

      {desk ? null : (
        <m.aside
          animate={{ width: collapsed ? 76 : 264 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-canvas/80 backdrop-blur-xl lg:block"
        >
          <Sidebar me={me} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </m.aside>
      )}

      <AnimatePresence>
        {drawer && !desk ? (
          <m.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[#05060a]/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <m.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              className="absolute inset-y-0 left-0 w-[min(284px,85vw)] border-r border-line bg-canvas shadow-pop"
            >
              <Sidebar me={me} collapsed={false} mobile onNavigate={() => setDrawer(false)} />
            </m.aside>
          </m.div>
        ) : null}
      </AnimatePresence>

      <div className={cn('relative min-w-0 overflow-x-clip transition-[padding] duration-300', desk ? '' : collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]')}>
        <Topbar me={me} onMenu={() => setDrawer(true)} onSearch={openPalette} />
        <main className="mx-auto w-full max-w-[1480px] px-3 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-7 lg:px-10 lg:py-9">
          {/* Owner 2026-10-07: the tabs stay put while the page below
              changes, so a far-right tab doesn't throw the strip back. */}
          {hidden ? null : desk ? (
            deskOn ? (
              pathname.startsWith('/desk') ? null : <BackToDesk href={home} />
            ) : (
              <DeskTabs me={me} />
            )
          ) : (
            <SectionTabs me={me} />
          )}
          <m.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {hidden ? (
              <div className="py-24 text-center">
                <div className="text-5xl font-semibold text-faint">404</div>
                <p className="mt-3 text-sm text-muted">Такой страницы нет.</p>
              </div>
            ) : toDesk ? null : (
              // 2026-11-10: while `me` is unknown the page is already mounted,
              // so its data is asked for together with /auth/me (Lighthouse
              // reports: since C-c14 every page asked 60-120 ms after /auth/me
              // answered, before it 40-60 ms before), but it is invisible: an
              // owner-only page still never flashes, and its data stays the
              // server's to refuse. Same element either way: no remount.
              <div className={waiting ? 'contents invisible' : 'contents'} aria-hidden={waiting || undefined}>
                {children}
              </div>
            )}
          </m.div>
        </main>
      </div>
      {desk ? null : <BottomNav me={me} onMore={() => setDrawer(true)} />}
      {paletteMounted ? <CommandPalette me={me} open={palette} setOpen={setPalette} /> : null}
    </div>
  );
}

/** A card of a desk item (a ticket, a request) opens inside the shell: one way back to the desk. */
function BackToDesk({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      ← На стол
    </Link>
  );
}
