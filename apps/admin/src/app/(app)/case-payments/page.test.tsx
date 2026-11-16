import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { LazyMotion, domMax } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Row 177 (detective R3A-10): «Оплаты адвокатам» keeps the tab and every
 * tab's status filter in the address, so a reload or a shared link opens
 * the same list.
 */
class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).IntersectionObserver ??= NoObserver;
(globalThis as Record<string, unknown>).ResizeObserver ??= NoObserver;
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

const calls = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  useParams: () => ({}),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={String(href)}>{children}</a>,
}));
vi.mock('@/lib/hooks', async (orig) => ({
  ...(await orig<typeof import('@/lib/hooks')>()),
  useMe: () => ({ data: { id: 'me', role: 'super_admin', permissions: {}, areas: {} } }),
}));
vi.mock('@/lib/api/client', () => ({
  api: {
    GET: (...a: unknown[]) => calls.GET(...a),
    POST: vi.fn(async () => ({ data: { data: {} } })),
    PUT: vi.fn(),
    PATCH: vi.fn(async () => ({ data: { data: {} } })),
    DELETE: vi.fn(),
  },
  errorText: (e: unknown) => String(e),
  errorDetail: () => undefined,
}));

const page = { data: [], meta: { nextCursor: null } };

function mount(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LazyMotion features={domMax}>
        <ToastProvider>{ui}</ToastProvider>
      </LazyMotion>
    </QueryClientProvider>,
  );
}

const queriesOf = (path: string) =>
  calls.GET.mock.calls.filter((c) => c[0] === path).map((c) => ((c[1] as { params?: { query?: Record<string, unknown> } })?.params?.query ?? {}));

beforeEach(() => {
  calls.GET.mockImplementation(async (path: string) => {
    if (path === '/admin/case-payments/stats') return { data: { data: null } };
    return { data: page };
  });
});
afterEach(() => {
  cleanup();
  calls.GET.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('«Оплаты адвокатам» filters in the address (row 177)', () => {
  it('opens the requests tab with its status from the address', async () => {
    window.history.replaceState(null, '', '/case-payments?tab=requests&requestStatus=paid');
    const { default: Page } = await import('./page');
    mount(<Page />);
    await waitFor(() => expect(queriesOf('/admin/case-payments/requests').at(-1)).toMatchObject({ status: 'paid' }));
  });

  it('opens the accounts tab with its status from the address', async () => {
    window.history.replaceState(null, '', '/case-payments?tab=accounts&accountStatus=restricted');
    const { default: Page } = await import('./page');
    mount(<Page />);
    await waitFor(() => expect(queriesOf('/admin/case-payments/payout-accounts').at(-1)).toMatchObject({ status: 'restricted' }));
  });

  it('an unknown status in the address falls back to all', async () => {
    window.history.replaceState(null, '', '/case-payments?tab=requests&requestStatus=bogus');
    const { default: Page } = await import('./page');
    mount(<Page />);
    await waitFor(() => expect(queriesOf('/admin/case-payments/requests').length).toBeGreaterThan(0));
    expect(queriesOf('/admin/case-payments/requests').at(-1)?.status).toBeUndefined();
  });
});
