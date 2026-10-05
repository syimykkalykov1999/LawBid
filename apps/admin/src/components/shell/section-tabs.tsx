'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Me } from '@/lib/hooks';
import { groupFor, sectionFor, tabsFor } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';
import { useNavCounts } from './use-nav-counts';

/** Owner 2026-10-05: the tabs of the current menu section — only the ones
 * this admin may open. One allowed tab → no tab row at all. Long rows
 * scroll sideways instead of wrapping. */
export function SectionTabs({ me }: { me: Me | undefined }) {
  const pathname = usePathname();
  const counts = useNavCounts(me);
  if (!me) return null;
  const tabs = tabsFor(me, pathname);
  if (tabs.length < 2) return null;
  const current = sectionFor(pathname)?.href;
  const group = groupFor(pathname);
  return (
    <nav aria-label={group?.label} className="-mx-1 mb-6 overflow-x-auto pb-1">
      <div className="flex w-max min-w-full gap-1 border-b border-line px-1">
        {tabs.map((t) => {
          const I = ICONS[t.icon];
          const on = t.href === current;
          const count = t.count ? counts[t.count] : undefined;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors',
                on ? 'border-gold font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {I ? <I size={16} weight={on ? 'regular' : 'light'} className={cn(on && 'text-gold-600')} /> : null}
              {t.label}
              {count ? (
                <span className="grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[10px] leading-5 font-semibold text-[#0b0b0d]">
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
