'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { dashboardQuery, livePoll, supportStatsQuery, trustStatsQuery } from '@/lib/live';
import { can, canOpen, type CountKey } from '@/lib/rbac';
import type { Me } from '@/lib/hooks';

/**
 * Sidebar badges: work waiting in each queue (refreshes every minute).
 * The only place these three keys are polled; pages read the same cache.
 */
export function useNavCounts(me: Me | undefined): Partial<Record<CountKey, number>> {
  const dash = useQuery({
    ...dashboardQuery,
    refetchInterval: livePoll(),
    enabled: can(me, 'dashboard'),
  }).data;
  const support = useQuery({
    ...supportStatsQuery,
    refetchInterval: livePoll(),
    enabled: can(me, 'support'),
  }).data;
  // Owner 2026-10-05: «Борьба с мошенниками» — attorneys waiting for a person.
  const trust = useQuery({
    ...trustStatsQuery,
    refetchInterval: livePoll(),
    enabled: can(me, 'verification'),
  }).data;
  // Owner 2026-10-22 (maker-checker): requests this admin could approve.
  const approvals = useQuery({
    queryKey: ['approvals-count'],
    queryFn: async () => (await api.GET('/admin/approvals/count')).data!.data,
    refetchInterval: livePoll(),
    enabled: !!me && canOpen(me, '/approvals'),
  }).data;
  return {
    approvals: approvals?.pending,
    verification: dash?.verification.queueSize,
    trust: trust?.inQueue,
    reports: dash?.openReports,
    support: support ? support.unreadByAdmin : undefined,
  };
}
