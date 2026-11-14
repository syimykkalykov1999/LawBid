import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/** Detective R3A-4 (14.11): «Вернуть деньги» on a bank-request refund moved
 * money on one click. Now a confirm with the amount and the person comes
 * first (Stripe «Refund payment»), and only the clicked row spins. */
const post = vi.fn((path: string, init: unknown) => Promise.resolve({ data: { data: { path, init } } }));
const row = (id: string, amountCents: number, name: string) => ({
  id,
  userId: `u_${id}`,
  user: { id: `u_${id}`, name, email: `${id}@x.test` },
  status: 'review',
  amountCents,
  reason: null,
  note: null,
  createdAt: '2026-11-14T10:00:00Z',
});
vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn((path: string) =>
      Promise.resolve({
        data:
          path === '/admin/billing/dispute-refunds'
            ? { data: [row('dr_1', 12_345, 'Анна Клиент'), row('dr_2', 500, 'Борис')], meta: { nextCursor: null } }
            : { data: [], meta: { nextCursor: null } },
      }),
    ),
    POST: (path: string, init: unknown) => post(path, init),
  },
}));
vi.mock('@/lib/hooks', async (orig) => ({
  ...(await orig<typeof import('@/lib/hooks')>()),
  useMe: () => ({ data: { id: 'a1', role: 'super_admin', reasonRequiredAreas: [] } }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/payments', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import PaymentsPage from './page';

beforeEach(() => {
  window.history.replaceState(null, '', '/payments?tab=disputes');
  post.mockClear();
});
afterEach(cleanup);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <PaymentsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('«Возвраты по спорам» approve (R3A-4)', () => {
  it('asks with the amount and the person before any money moves', async () => {
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Вернуть деньги' });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText('Вернуть $123.45?')).toBeTruthy();
    expect(screen.getByText(/Деньги уйдут на карту: Анна Клиент/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    const confirmBtn = screen
      .getAllByRole('button', { name: 'Вернуть деньги' })
      .find((b) => b.closest('[role="dialog"]'));
    fireEvent.click(confirmBtn!);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/admin/billing/dispute-refunds/{id}/approve');
    expect(post.mock.calls[0][1]).toEqual({ params: { path: { id: 'dr_1' } } });
  });

  it('cancel sends nothing', async () => {
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: 'Вернуть деньги' });
    fireEvent.click(buttons[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByText(/Вернуть \$5\.00\?/)).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });
});
