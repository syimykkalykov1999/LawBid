'use client';

import { CaretDoubleLeft } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Me } from '@/lib/hooks';
import { groupFor, groupsFor } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';
import { Logo, LogoMark } from './logo';
import { useNavCounts } from './use-nav-counts';
import { useOffFlags } from './use-off-flags';

export function Sidebar({
  me,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  mobile,
}: {
  me: Me | undefined;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const counts = useNavCounts(me);
  const active = groupFor(pathname)?.key;
  const off = useOffFlags(me);
  const groups = me ? groupsFor(me, off) : [];
  const narrow = collapsed && !mobile;

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center', narrow ? 'justify-center px-2' : 'justify-between px-5')}>
        <Link href="/" onClick={onNavigate} aria-label="LawBid Admin">
          {narrow ? <LogoMark /> : <Logo />}
        </Link>
        {!mobile && onToggleCollapsed && !narrow ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Свернуть меню"
            className="rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <CaretDoubleLeft size={16} />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {!me
          ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton mx-2 my-2.5 h-5 rounded-md" />)
          : groups.map((g) => {
              // Owner 2026-10-05: one menu row per section; it opens the
              // first tab this admin may see, the rest are tabs on the page.
              const first = g.items[0];
              const I = ICONS[g.icon];
              const isActive = active === g.key;
              const count = g.items.reduce((n, s) => n + ((s.count ? counts[s.count] : 0) ?? 0), 0);
              return (
                <Link
                  key={g.key}
                  href={first.href}
                  onClick={onNavigate}
                  title={narrow ? g.label : undefined}
                  className={cn(
                    'group relative my-0.5 flex items-center gap-3 rounded-xl text-[13.5px] transition-colors duration-200',
                    narrow ? 'h-10 justify-center' : 'h-10 px-3',
                    isActive ? 'font-medium text-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId={mobile ? 'nav-active-m' : 'nav-active'}
                      className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card"
                      transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                    >
                      <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-x-[1px] -translate-y-1/2 rounded-full bg-gold" />
                    </motion.span>
                  ) : (
                    <span className="absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover:bg-surface-2 group-hover:opacity-100" />
                  )}
                  {I ? (
                    <I
                      size={19}
                      weight={isActive ? 'regular' : 'light'}
                      className={cn('relative z-10 transition-colors', isActive && 'text-gold-600')}
                    />
                  ) : null}
                  {narrow ? null : <span className="relative z-10 min-w-0 flex-1 truncate">{g.label}</span>}
                  {count ? (
                    <span
                      className={cn(
                        'relative z-10 grid min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[10px] leading-5 font-semibold text-[#0b0b0d]',
                        narrow && 'absolute top-0.5 right-1 min-w-4 px-1 text-[9px] leading-4',
                      )}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
      </nav>
      {narrow && onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Развернуть меню"
          className="mx-auto mb-4 rounded-lg p-2 text-faint hover:bg-surface-2 hover:text-ink"
        >
          <CaretDoubleLeft size={16} className="rotate-180" />
        </button>
      ) : null}
    </div>
  );
}
