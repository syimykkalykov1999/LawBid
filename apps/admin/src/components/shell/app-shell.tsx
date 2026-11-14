'use client';

import { AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import * as m from 'motion/react-m';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, ViewTransition } from 'react';
import { deskHome, outsideDesk } from '@/lib/desk';
import { useDeskSettings } from '@/lib/desk-data';
import { useDragDismiss } from '@/lib/drag-dismiss';
import { type Me, useMe } from '@/lib/hooks';
import { useEscapeLayer } from '@/lib/layers';
import { NAV_TRANSITION } from '@/lib/nav-transition';
import { useTabTitle } from './use-tab-title';
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
  useTabTitle(me, pathname);
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
        // Owner row 88 (2026-11-13): the rail width and the content padding
        // move on ONE clock and curve (shadcn/ui sidebar, MIT:
        // `transition-[width] duration-200 ease-linear`), so the edges no
        // longer drift apart (it was a spring on width + a 300 ms CSS padding).
        <aside
          style={{ width: collapsed ? 76 : 264 }}
          className="fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-canvas/80 backdrop-blur-xl transition-[width] duration-200 ease-linear lg:block"
        >
          <Sidebar me={me} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </aside>
      )}

      <AnimatePresence>{drawer && !desk ? <MobileDrawer me={me} onClose={() => setDrawer(false)} /> : null}</AnimatePresence>

      <div className={cn('relative min-w-0 overflow-x-clip transition-[padding] duration-200 ease-linear', desk ? '' : collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]')}>
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
          {/* Owner row 88 (2026-11-13): the page swap is a React
              <ViewTransition> crossfade (Next.js guide «Designing view
              transitions», 2026-10-15: same-route crossfade recipe; 120 ms
              out / 150 ms in, globals.css). Only the menu links (sidebar,
              section tabs, bottom bar) carry the `admin-nav` type, so the
              browser's back / forward and the iPhone edge swipe swap at once
              (no second animation after Safari's own). Browsers without View
              Transitions swap at once, like Instagram and Telegram web. No
              transform on the wrapper, so sticky / fixed parts never jump. */}
          <ViewTransition
            key={pathname}
            name="admin-page"
            share={{ [NAV_TRANSITION]: 'admin-page', default: 'none' }}
            enter={{ [NAV_TRANSITION]: 'admin-page', default: 'none' }}
            exit={{ [NAV_TRANSITION]: 'admin-page', default: 'none' }}
            default="none"
          >
            <div>
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
            </div>
          </ViewTransition>
        </main>
      </div>
      {desk ? null : <BottomNav me={me} onMore={() => setDrawer(true)} />}
      {paletteMounted ? <CommandPalette me={me} open={palette} setOpen={setPalette} /> : null}
    </div>
  );
}

/**
 * Phone menu (☰ / «Ещё»). Owner row 88 (2026-11-13): it follows the finger
 * and closes with a swipe to the left, like the Telegram / Instagram side
 * menus — vaul's drag logic, thresholds and curve (MIT, lib/drag-dismiss.ts);
 * Esc closes it when it is the top layer. The backdrop dims with the swipe.
 * Look unchanged.
 */
function MobileDrawer({ me, onClose }: { me: Me | undefined; onClose: () => void }) {
  const x = useMotionValue<number | string>(0);
  const width = useRef(284);
  const dim = useTransform(x, (v) => (typeof v === 'number' ? Math.min(1, Math.max(0, 1 + v / width.current)) : 1));
  const drag = useDragDismiss({ offset: x, direction: 'left', enabled: true, onClose });
  useEscapeLayer(true, onClose);
  const { ref: dragRef } = drag;
  const setPanel = useCallback(
    (node: HTMLElement | null) => {
      dragRef(node);
      if (node) width.current = node.getBoundingClientRect().width || 284;
    },
    [dragRef],
  );
  return (
    <m.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <m.div className="absolute inset-0 bg-[#05060a]/50 backdrop-blur-sm" style={{ opacity: dim }} onClick={onClose} />
      <m.aside
        ref={setPanel}
        {...drag.handlers}
        style={{ x }}
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        exit={{ x: -300 }}
        transition={{ type: 'spring', stiffness: 420, damping: 40 }}
        onAnimationStart={drag.markOpened}
        className="absolute inset-y-0 left-0 w-[min(284px,85vw)] border-r border-line bg-canvas shadow-pop"
      >
        <Sidebar me={me} collapsed={false} mobile onNavigate={onClose} />
      </m.aside>
    </m.div>
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
