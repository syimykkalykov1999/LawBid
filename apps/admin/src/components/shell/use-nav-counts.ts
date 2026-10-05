'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { can, type CountKey } from '@/lib/rbac';
import type { Me } from '@/lib/hooks';

/** Sidebar badges: work waiting in each queue (refreshes every minute). */
export function useNavCounts(me: Me | undefined): Partial<Record<CountKey, number>> {
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.GET('/admin/dashboard')).data!.data,
    refetchInterval: 60_000,
    enabled: can(me, 'dashboard'),
  }).data;
  const support = useQuery({
    queryKey: ['support-stats'],
    queryFn: async () => (await api.GET('/admin/support/stats')).data!.data,
    refetchInterval: 60_000,
    enabled: can(me, 'support'),
  }).data;
  // Owner 2026-10-05: «Борьба с мошенниками» — attorneys waiting for a person.
  const trust = useQuery({
    queryKey: ['trust-stats'],
    queryFn: async () => (await api.GET('/admin/trust/stats')).data!.data,
    refetchInterval: 60_000,
    enabled: can(me, 'verification'),
  }).data;
  return {
    verification: dash?.verification.queueSize,
    trust: trust?.inQueue,
    reports: dash?.openReports,
    support: support ? support.unreadByAdmin : undefined,
  };
}
