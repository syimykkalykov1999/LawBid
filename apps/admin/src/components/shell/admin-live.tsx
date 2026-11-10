'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { startAdminLive } from '@/lib/admin-live';

/** Speed matrix 2026-11-09 (§3 #5): the live channel of a signed-in tab
 * (lib/admin-live.ts); mounted once by the app layout, draws nothing. */
export function AdminLive() {
  const qc = useQueryClient();
  useEffect(() => startAdminLive(qc), [qc]);
  return null;
}
