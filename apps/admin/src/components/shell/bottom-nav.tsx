'use client';

import { List } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Me } from '@/lib/hooks';
import { groupFor, groupsFor } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';
import { useNavCounts } from './use-nav-counts';
import { useOffFlags } from './use-off-flags';

const SLOTS = 4;

/** Phone navigation (< lg): the first four sections the admin may open plus
 * «Ещё», which opens the full menu drawer. The active section is always
 * shown, swapped in for the last slot when it isn't among the first four. */
export function BottomNav({ me, onMore }: { me: Me | undefined; onMore: () => void }) {
  const pathname = usePathname();
  const counts = useNavCounts(me);
  const off = useOffFlags(me);
  if (!me) return null;
  const groups = groupsFor(me, off);
  const active = groupFor(pathname, me)?.key;
  let shown = groups.slice(0, SLOTS);
  const current = groups.find((g) => g.key === active);
  if (current && !shown.includes(current)) shown = [...shown.slice(0, SLOTS - 1), current];

  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {shown.map((g) => {
        const I = ICONS[g.icon];
        const isActive = g.key === active;
        const count = g.items.reduce((n, s) => n + ((s.count ? counts[s.count] : 0) ?? 0), 0);
        return (
          <Link
            key={g.key}
            href={g.items[0].href}
            className={cn(
              'relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10.5px] transition-colors',
              isActive ? 'font-medium text-ink' : 'text-muted',
            )}
          >
            {I ? <I size={22} weight={isActive ? 'fill' : 'light'} className={cn(isActive && 'text-gold-600')} /> : null}
            <span className="w-full truncate text-center">{g.label}</span>
            {count ? (
              <span className="absolute top-1.5 left-1/2 ml-2 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] leading-4 font-semibold text-[#0b0b0d]">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10.5px] text-muted"
      >
        <List size={22} weight="light" />
        <span>Ещё</span>
      </button>
    </nav>
  );
}
