import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PieceOverview, Rate } from '@/lib/staff-data';

let rates: { ok: true; data: Rate[] } | { ok: false; missing: true } = { ok: false, missing: true };
let month: { ok: true; data: PieceOverview } | { ok: false; missing: true } = { ok: false, missing: true };
const put = vi.fn().mockResolvedValue({});
const post = vi.fn().mockResolvedValue({});
const del = vi.fn().mockResolvedValue({});

vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { role: 'super_admin', permissions: {} } }) }));
vi.mock('@/lib/api/client', () => ({ api: { GET: vi.fn() }, ApiError: class extends Error {}, toProxy: { onRequest: () => undefined }, errorText: String }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('@/lib/staff-data', async (orig) => {
  const real = await orig<typeof import('@/lib/staff-data')>();
  return {
    ...real,
    useRates: () => ({ data: rates, isPending: false, error: null }),
    usePieceOverview: () => ({ data: month, isPending: false, error: null }),
    staffPut: (...a: unknown[]) => put(...a),
    staffPost: (...a: unknown[]) => post(...a),
    staffDelete: (...a: unknown[]) => del(...a),
  };
});

import { centsFromInput, RatesPage } from './rates-page';

const rate = (over: Partial<Rate> = {}): Rate => ({ id: 'r1', kind: 'verification', workspace: 'mass', amountCents: 35, currency: 'usd', validFrom: '2026-10-01T00:00:00Z', validTo: null, boostMult: null, active: true, ...over });
const overview: PieceOverview = {
  period: '2026-10',
  scope: 'owner',
  currency: 'usd',
  totals: { people: 1, units: 40, heldUnits: 2, amountCents: 1400 },
  people: [
    {
      adminId: 'a1',
      name: 'Пётр Иванов',
      workspace: 'mass',
      units: 40,
      heldUnits: 2,
      amountCents: 1400,
      days: [
        { day: '2026-10-26', units: 20, heldUnits: 0, qualityMult: 1.1, amountCents: 770, status: 'accrued', noRating: false },
        { day: '2026-10-25', units: 20, heldUnits: 2, qualityMult: 1, amountCents: 630, status: 'disputed', noRating: false },
      ],
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RatesPage />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  put.mockClear();
  post.mockClear();
  del.mockClear();
  rates = { ok: false, missing: true };
  month = { ok: false, missing: true };
});

describe('centsFromInput', () => {
  it('turns dollars into cents, refuses nonsense', () => {
    expect(centsFromInput('0,35')).toBe(35);
    expect(centsFromInput(' 1.5 ')).toBe(150);
    for (const bad of ['', '0', '-1', 'abc', '1001', '0,001']) expect(centsFromInput(bad), bad).toBeNull();
  });
});

describe('«Ставки за решения»', () => {
  it('piecework off (route 404): an explanation, no form', () => {
    renderPage();
    expect(screen.getByText('Оплата за решения выключена')).toBeTruthy();
    expect(screen.queryByText('Сохранить ставку')).toBeNull();
  });

  it('lists the rates and saves a new one in cents', async () => {
    rates = { ok: true, data: [rate()] };
    month = { ok: true, data: overview };
    renderPage();
    expect(screen.getByText('Проверка документов', { selector: 'td' })).toBeTruthy();
    const save = screen.getByText('Сохранить ставку');
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Цена, доллары'), { target: { value: '0,40' } });
    fireEvent.click(save);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/staff/rates', { kind: 'verification', workspace: 'mass', amountCents: 40, boostMult: undefined }));
  });

  it('ends an active rate', async () => {
    rates = { ok: true, data: [rate()] };
    month = { ok: true, data: overview };
    renderPage();
    fireEvent.click(screen.getByText('Закончить'));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/admin/staff/rates/r1'));
  });

  it('month overview: days can be held or recounted', async () => {
    rates = { ok: true, data: [] };
    month = { ok: true, data: overview };
    renderPage();
    expect(screen.getByText('Ставок нет: без ставки за решения ничего не начисляется.')).toBeTruthy();
    fireEvent.click(screen.getByText('Дни'));
    const days = screen.getAllByTestId('piece-day');
    expect(days).toHaveLength(2);
    fireEvent.click(within(days[0]).getByText('Удержать'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/staff/piecework/a1/2026-10-26/dispute', expect.objectContaining({ reason: expect.any(String) })));
    // a held day has no «hold» button, only a recount
    expect(within(days[1]).queryByText('Удержать')).toBeNull();
    fireEvent.click(within(days[1]).getByText('Пересчитать'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/staff/piecework/a1/2026-10-25/rerun'));
  });
});
