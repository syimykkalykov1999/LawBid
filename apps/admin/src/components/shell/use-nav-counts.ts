'use client';

import { useQuery } from '@tanstack/react-query';
import { countsQuery, livePoll } from '@/lib/live';
import { can, canOpen, navModeFor, type CountKey } from '@/lib/rbac';
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
  // Staff package T2: a worker of a workspace sees counters only for the
  // pages of their own workspace.
  const desk = navModeFor(me) === 'desk';
  const ok = (area: string, href: string) => can(me, area) && (!desk || canOpen(me, href));
  return {
    verification: ok('dashboard', '/verification') ? counts.verificationQueue : undefined,
    trust: ok('verification', '/verification/trust') ? counts.trustQueue : undefined,
    reports: ok('dashboard', '/moderation') ? counts.openReports : undefined,
    support: ok('support', '/support') ? counts.supportUnread : undefined,
  };
}
