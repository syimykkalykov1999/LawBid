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
  canManageAdmins: boolean;
  hasSecurityQuestion: boolean;
  securityQuestion: string | null;
  /** Owner 2026-10-05: sections where this admin must write a reason. */
  reasonRequiredAreas?: string[];
  /** Owner 2026-10-05: countries this admin works in (empty = all). */
  countries?: string[];
  /** Country tabs to pick from in the top bar. */
  countryTabs?: { code: string; name: string }[];
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
