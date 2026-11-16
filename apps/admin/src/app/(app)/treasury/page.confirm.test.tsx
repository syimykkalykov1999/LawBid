import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/** Row 178 / detective R3A-5 (14.11): «Поделить сейчас» sent real money and
 * the trash button deleted an expense line on one click. Both now ask first
 * with the existing useConfirm dialog (Stripe «Pay out funds»: amounts and
 * bank, then confirm); «Отмена» sends nothing. */
const post = vi.fn((path: string) => Promise.resolve({ data: { data: { path, skipped: null, expensesCents: 0, profitCents: 0, shortfallCents: 0 } } }));
const del = vi.fn((path: string, init: unknown) => Promise.resolve({ data: { data: overview(), path, init } }));

function overview() {
  return {
    availableCents: 500_000,
    pendingCents: 0,
    setup: {
      stripeConnected: true,
      manualPayouts: true,
      payoutInterval: 'manual',
      banksListed: true,
      bankCount: 1,
      separateExpenseBank: false,
    },
    profitBank: { id: 'ba_1', label: 'Chase', last4: '6789', isDefault: true },
    expenseBank: null,
    plan: {
      servicesCents: 0,
      expenseAllowanceCents: 0,
      stripeObligationsCents: 0,
      cushionCents: 0,
      reserveTargetCents: 100_000,
      monthlyCostCents: 20_000,
      expensePayoutCents: 12_345,
      profitPayoutCents: 67_890,
      heldProfitCents: 0,
      shortfallCents: 0,
      coverMonths: 5,
    },
    expenses: [
      { id: 'e_1', name: 'Офис', monthlyCents: 20_000, effectiveCents: 20_000, source: 'manual', active: true, sort: 0 },
    ],
    costLines: [],
    settings: {
      auto: false,
      payoutDay: 1,
      bufferPercent: 10,
      refundBufferUsd: 0,
      minProfitUsd: 0,
      payrollAuto: false,
      payrollDay: 1,
      payrollWarnDays: 3,
    },
    payouts: [],
    nextRunAt: '2026-12-01T00:00:00Z',
    ranThisPeriod: false,
    payroll: { stripeReady: true, nextPayAt: '2026-12-01T00:00:00Z', paidThisPeriod: false, dueCents: 0, people: 0, notLinked: [], shortCents: 0 },
  };
}

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn(() => Promise.resolve({ data: { data: overview() } })),
    POST: (path: string) => post(path),
    PUT: vi.fn(),
    PATCH: vi.fn(),
    DELETE: (path: string, init: unknown) => del(path, init),
  },
}));
vi.mock('@/lib/hooks', async (orig) => ({
  ...(await orig<typeof import('@/lib/hooks')>()),
  useMe: () => ({ data: { id: 'a1', role: 'super_admin', reasonRequiredAreas: [] } }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/treasury', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import TreasuryPage from './page';

beforeEach(() => {
  post.mockClear();
  del.mockClear();
});
afterEach(cleanup);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TreasuryPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const inDialog = (name: string) =>
  screen.getAllByRole('button', { name }).find((b) => b.closest('[role="dialog"]'));

describe('«Прибыль и резерв» money buttons (row 178, R3A-5)', () => {
  it('«Поделить сейчас» shows the amounts and the bank before any payout', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Поделить сейчас/ }));
    expect(await screen.findByText('Поделить сейчас?')).toBeTruthy();
    expect(screen.getByText(/Расходы \$123\.45, прибыль \$678\.90 уйдут на .*Chase/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(inDialog('Отправить')!);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/admin/treasury/run');
  });

  it('«Отмена» on «Поделить сейчас» sends nothing', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Поделить сейчас/ }));
    fireEvent.click(inDialog('Отмена')!);
    await waitFor(() => expect(screen.queryByText('Поделить сейчас?')).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it('deleting an expense line asks first; only «Удалить» deletes it', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить Офис' }));
    expect(await screen.findByText('Удалить «Офис»?')).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(inDialog('Отмена')!);
    await waitFor(() => expect(screen.queryByText('Удалить «Офис»?')).toBeNull());
    expect(del).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить Офис' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Удалить' })).find((b) => b.closest('[role="dialog"]'))!);
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del.mock.calls[0]).toEqual(['/admin/treasury/expenses/{id}', { params: { path: { id: 'e_1' } } }]);
  });
});
