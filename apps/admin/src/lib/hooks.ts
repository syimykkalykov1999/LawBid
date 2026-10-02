'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AdminRole, Permissions } from '@/lib/rbac';

export interface Me {
  id: string;
  email: string;
  role: AdminRole;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  login: string | null;
  hasPassword: boolean;
  permissions: Permissions;
  hasSecurityQuestion: boolean;
  securityQuestion: string | null;
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
