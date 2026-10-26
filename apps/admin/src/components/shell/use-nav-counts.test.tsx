import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GET = vi.fn();
vi.mock('@/lib/api/client', () => ({
  api: { GET: (...args: unknown[]) => GET(...args) },
  ApiError: class ApiError extends Error {},
}));

import { useNavCounts } from './use-nav-counts';
import type { Me } from '@/lib/hooks';

/** Owner 2026-10-22 (client economy plan, package J): the sidebar badges
 * come from ONE request, not four. */
describe('useNavCounts', () => {
  beforeEach(() => GET.mockReset());

  function wrapper({ children }: { children: ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  const superAdmin = {
    id: 'a',
    email: 'a@x',
    role: 'super_admin',
    totpEnabled: true,
    lastLoginAt: null,
    login: null,
    hasPassword: true,
    permissions: {},
  } as unknown as Me;

  it('asks GET /admin/counts once and maps the five badges', async () => {
    GET.mockResolvedValue({
      data: {
        data: {
          verificationQueue: 3,
          openReports: 2,
          supportUnread: 5,
          trustQueue: 1,
          approvalsPending: 4,
        },
      },
    });
    const { result } = renderHook(() => useNavCounts(superAdmin), { wrapper });
    await waitFor(() => expect(result.current.support).toBe(5));
    expect(result.current).toEqual({
      approvals: 4,
      verification: 3,
      trust: 1,
      reports: 2,
      support: 5,
    });
    expect(GET).toHaveBeenCalledTimes(1);
    expect(GET).toHaveBeenCalledWith('/admin/counts');
  });

  it('asks nothing without a signed-in admin', () => {
    const { result } = renderHook(() => useNavCounts(undefined), { wrapper });
    expect(result.current).toEqual({});
    expect(GET).not.toHaveBeenCalled();
  });
});
