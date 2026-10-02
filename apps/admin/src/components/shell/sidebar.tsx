'use client';

import { CaretDoubleLeft } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Me } from '@/lib/hooks';
import { groupsFor, sectionFor } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';
import { Logo, LogoMark } from './logo';
import { useNavCounts } from './use-nav-counts';

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
  const active = sectionFor(pathname)?.href;
  const groups = me ? groupsFor(me) : [];
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
          : groups.map((g) => (
              <div key={g.label} className="mb-3">
                <AnimatePresence initial={false}>
                  {narrow ? (
                    <div className="mx-auto my-2 h-px w-6 bg-line" />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-faint"
                    >
                      {g.label}
                    </motion.div>
                  )}
                </AnimatePresence>
                {g.items.map((s) => {
                  const I = ICONS[s.icon];
                  const isActive = active === s.href;
                  const count = s.count ? counts[s.count] : undefined;
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      onClick={onNavigate}
                      title={narrow ? s.label : undefined}
                      className={cn(
                        'group relative my-0.5 flex items-center gap-3 rounded-xl text-[13.5px] transition-colors duration-200',
                        narrow ? 'h-10 justify-center' : 'h-9 px-3',
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
                      {narrow ? null : <span className="relative z-10 flex-1 truncate">{s.label}</span>}
                      {count ? (
                        <span
                          className={cn(
                            'relative z-10 grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] leading-5 font-semibold text-[#0b0b0d]',
                            narrow && 'absolute top-0.5 right-1 min-w-4 px-1 text-[9px] leading-4',
                          )}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
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
