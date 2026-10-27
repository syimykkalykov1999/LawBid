'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { can, navModeFor } from '@/lib/rbac';
import { useStaffSwitches } from '@/lib/staff-data';
import type { Me } from '@/lib/hooks';

type Flag = { key: string; enabled: boolean };

/** Menu items of the staff package, each tied to its `staff.*` switch. */
export const STAFF_NAV_SWITCHES = [
  'staff.owner_home_enabled',
  'staff.rating_enabled',
  'staff.appeals_enabled',
  'staff.piecework_enabled',
  'staff.desk_enabled',
] as const;

/**
 * Feature flags that are switched off, so the menu can hide what they
 * control (owner 2026-10-20: the deadline calculator). Only an admin who
 * may read the flags (area «settings») gets the list; for the rest nothing
 * is hidden. Shares the ['flags'] cache with the «Функции» page.
 * Staff package T10: the owner's staff pages are hidden until their
 * `staff.*` switch is known to be on (so with everything off, and while the
 * switches are still loading, the menu is exactly the old one).
 */
export function useOffFlags(me: Me | undefined): ReadonlySet<string> {
  const flags = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data as Flag[],
    // A worker of a workspace does not reach the settings area at all.
    enabled: can(me, 'settings') && navModeFor(me) !== 'desk',
  }).data;
  const staff = useStaffSwitches(me).data;
  const off = new Set((flags ?? []).filter((f) => !f.enabled).map((f) => f.key));
  for (const k of STAFF_NAV_SWITCHES) if (staff?.[k] !== true) off.add(k);
  return off;
}
