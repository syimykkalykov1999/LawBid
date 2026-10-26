'use client';

import { usePathname } from 'next/navigation';
import { OverflowTabs } from '@/components/ui/overflow-tabs';
import type { Me } from '@/lib/hooks';
import { groupFor, sectionFor, tabsFor } from '@/lib/rbac';
import { ICONS } from './icons';
import { useNavCounts } from './use-nav-counts';
import { useOffFlags } from './use-off-flags';

/** Owner 2026-10-05: the tabs of the current menu section — only the ones
 * this admin may open. One allowed tab → no tab row at all.
 * Owner 2026-10-07: one even row with «Ещё ▾» for what doesn't fit; it
 * lives outside the page (app-shell), so it stays put on every tab click. */
export function SectionTabs({ me }: { me: Me | undefined }) {
  const pathname = usePathname();
  const counts = useNavCounts(me);
  const off = useOffFlags(me);
  if (!me) return null;
  const tabs = tabsFor(me, pathname, off);
  if (tabs.length < 2) return null;
  return (
    <OverflowTabs
      className="mb-6"
      label={groupFor(pathname)?.label}
      active={sectionFor(pathname)?.href}
      items={tabs.map((t) => ({
        href: t.href,
        label: t.label,
        icon: ICONS[t.icon],
        count: t.count ? counts[t.count] : undefined,
      }))}
    />
  );
}
