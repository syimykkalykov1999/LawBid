'use client';

import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const COLLAPSE_KEY = 'lawbid-admin-sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => setDrawer(false), [pathname]);

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
      {/* Ambient brand glow, like the site's hero. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[420px] w-[720px] rounded-full bg-gold/[0.07] blur-[120px] dark:bg-gold/[0.06]" />
        <div className="absolute -right-40 bottom-0 h-[380px] w-[560px] rounded-full bg-brand-navy/[0.06] blur-[120px] dark:bg-[#1b3170]/25" />
      </div>

      <motion.aside
        animate={{ width: collapsed ? 76 : 264 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-canvas/80 backdrop-blur-xl lg:block"
      >
        <Sidebar me={me} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </motion.aside>

      <AnimatePresence>
        {drawer ? (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[#05060a]/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              className="absolute inset-y-0 left-0 w-[284px] border-r border-line bg-canvas shadow-pop"
            >
              <Sidebar me={me} collapsed={false} mobile onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className={cn('relative transition-[padding] duration-300', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]')}>
        <Topbar me={me} onMenu={() => setDrawer(true)} onSearch={() => setPalette(true)} />
        <main className="mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
      <CommandPalette me={me} open={palette} setOpen={setPalette} />
    </div>
  );
}
