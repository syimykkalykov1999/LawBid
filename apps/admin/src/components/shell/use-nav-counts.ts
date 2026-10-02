'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AdminRole, CountKey } from '@/lib/rbac';

/** Sidebar badges: work waiting in each queue (refreshes every minute). */
export function useNavCounts(role: AdminRole | undefined): Partial<Record<CountKey, number>> {
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.GET('/admin/dashboard')).data!.data,
    refetchInterval: 60_000,
    enabled: !!role,
  }).data;
  const support = useQuery({
    queryKey: ['support-stats'],
    queryFn: async () => (await api.GET('/admin/support/stats')).data!.data,
    refetchInterval: 60_000,
    enabled: role === 'super_admin' || role === 'support' || role === 'moderator',
  }).data;
  return {
    verification: dash?.verification.queueSize,
    reports: dash?.openReports,
    support: support ? support.unreadByAdmin : undefined,
  };
}
