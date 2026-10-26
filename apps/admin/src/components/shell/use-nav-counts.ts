'use client';

import { useQuery } from '@tanstack/react-query';
import { countsQuery, livePoll } from '@/lib/live';
import { can, type CountKey } from '@/lib/rbac';
import type { Me } from '@/lib/hooks';

/**
 * Sidebar badges: work waiting in each queue (refreshes every minute).
 * Owner 2026-10-22 (client economy plan, package J): ONE request
 * (GET /admin/counts, four indexed counts, 304 when unchanged) instead of
 * the dashboard aggregate + support stats + trust stats
 * — three requests a minute per open tab. Pages that show the full stats
 * poll their own query while open.
 */
export function useNavCounts(me: Me | undefined): Partial<Record<CountKey, number>> {
  const counts = useQuery({
    ...countsQuery,
    refetchInterval: livePoll(),
    enabled: !!me,
  }).data;
  if (!counts || !me) return {};
  return {
    verification: can(me, 'dashboard') ? counts.verificationQueue : undefined,
    trust: can(me, 'verification') ? counts.trustQueue : undefined,
    reports: can(me, 'dashboard') ? counts.openReports : undefined,
    support: can(me, 'support') ? counts.supportUnread : undefined,
  };
}
