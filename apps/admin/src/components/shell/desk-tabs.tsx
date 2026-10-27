'use client';

import { usePathname } from 'next/navigation';
import { OverflowTabs } from '@/components/ui/overflow-tabs';
import type { Me } from '@/lib/hooks';
import { WORKSPACE_LABEL, deskTabsFor, sectionFor } from '@/lib/rbac';
import { ICONS } from './icons';
import { useNavCounts } from './use-nav-counts';
import { useOffFlags } from './use-off-flags';

/**
 * Staff package T2 (plan C1): a worker of the mass or finance workspace has
 * no left menu — one page with the pages of their own workspace as tabs on
 * top. The tabs are the same pages as before (the desks of T4/T8/T9 take
 * their content over later); only what lies in the workspace and what the
 * admin may open is listed, so nothing else exists for them.
 */
export function DeskTabs({ me }: { me: Me | undefined }) {
  const pathname = usePathname();
  const counts = useNavCounts(me);
  const off = useOffFlags(me);
  if (!me) return null;
  const tabs = deskTabsFor(me, off);
  if (tabs.length === 0) return null;
  return (
    <OverflowTabs
      className="mb-6"
      label={me.workspace ? WORKSPACE_LABEL[me.workspace] : undefined}
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
