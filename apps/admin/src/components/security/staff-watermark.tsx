'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';

/**
 * Owner 2026-10-27 (staff package T11): a faint diagonal watermark with the
 * admin's login and short id over the pages of the mass-work workspace, so a
 * photographed screen points back to the person. A pure CSS layer: it sits
 * above the page, takes no clicks and no space (no layout change). Only the
 * mass workspace asks the server, and the server says "off" until the owner
 * switches `staff.watermark_enabled` on.
 */
export function StaffWatermark() {
  const { data: me } = useMe();
  const mass = !!me && me.role !== 'super_admin' && me.workspace === 'mass';
  const q = useQuery({
    queryKey: ['staff-watermark'],
    queryFn: async () => {
      const { data } = await api.GET('/admin/pii/watermark');
      return data!.data as { enabled: boolean; text: string };
    },
    enabled: mass,
    staleTime: 15 * 60_000,
    retry: false,
  });
  if (!mass || !q.data?.enabled || !q.data.text) return null;
  return (
    <svg
      aria-hidden="true"
      data-testid="staff-watermark"
      width="100%"
      height="100%"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <defs>
        <pattern id="staff-wm" patternUnits="userSpaceOnUse" width="360" height="220">
          <text
            x="20"
            y="130"
            transform="rotate(-25 180 110)"
            fontFamily="sans-serif"
            fontSize="15"
            fill="rgba(128,128,128,0.16)"
          >
            {q.data.text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#staff-wm)" />
    </svg>
  );
}
