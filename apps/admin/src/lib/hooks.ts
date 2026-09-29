'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AdminRole } from '@/lib/rbac';

export interface Me {
  id: string;
  email: string;
  role: AdminRole;
  totpEnabled: boolean;
  lastLoginAt: string | null;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.GET('/admin/auth/me');
      return data!.data as Me;
    },
    staleTime: 5 * 60_000,
  });
}
