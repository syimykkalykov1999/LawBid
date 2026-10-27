'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AdminRole, AdminWorkspace, Permissions } from '@/lib/rbac';

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
  /** Owner 2026-10-16: people's phones, emails and names are masked for this admin. */
  noPii?: boolean;
  /** Owner 2026-10-06: member of a country partner's team (null = staff). */
  countryPartnerId?: string | null;
  /** The country partner themself. */
  partnerLead?: boolean;
  /** Staff package T2: `staff.workspaces_enabled`. Off = the panel looks as before. */
  workspacesEnabled?: boolean;
  /** …the workspace this admin works in (the super admin: owner). */
  workspace?: AdminWorkspace;
  /** …the head of that workspace (true only while the head role is on). */
  workspaceHead?: boolean;
  /** Owner 2026-10-22: may get system alerts, and the admin's own switch. */
  onCallAvailable?: boolean;
  onCallEnabled?: boolean;
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
