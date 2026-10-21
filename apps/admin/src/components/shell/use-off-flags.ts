'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { can } from '@/lib/rbac';
import type { Me } from '@/lib/hooks';

type Flag = { key: string; enabled: boolean };

/**
 * Feature flags that are switched off, so the menu can hide what they
 * control (owner 2026-10-20: the deadline calculator). Only an admin who
 * may read the flags (area «settings») gets the list; for the rest nothing
 * is hidden. Shares the ['flags'] cache with the «Функции» page.
 */
export function useOffFlags(me: Me | undefined): ReadonlySet<string> {
  const flags = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data as Flag[],
    enabled: can(me, 'settings'),
  }).data;
  return new Set((flags ?? []).filter((f) => !f.enabled).map((f) => f.key));
}
