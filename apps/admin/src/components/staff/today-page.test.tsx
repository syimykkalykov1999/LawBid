import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Today } from '@/lib/staff-data';

let todayResult: { ok: true; data: Today } | { ok: false; missing: true } = { ok: false, missing: true };
let digestResult: unknown = { ok: false, missing: true };
const staffGet = vi.fn();
const apiGet = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { role: 'super_admin', permissions: {} } }) }));
vi.mock('@/lib/api/client', () => ({
  api: { GET: (...a: unknown[]) => apiGet(...a), POST: vi.fn() },
  ApiError: class extends Error {},
  toProxy: { onRequest: () => undefined },
  errorText: String,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('@/lib/staff-data', async (orig) => {
  const real = await orig<typeof import('@/lib/staff-data')>();
  return {
    ...real,
    staffGet: (...a: unknown[]) => staffGet(...a),
    staffPost: vi.fn(),
    useToday: () => ({ data: todayResult, isPending: false, error: null }),
    useDigest: () => ({ data: digestResult, isPending: false }),
  };
});

import { TodayPage } from './today-page';

const rec = { advice: 'replace', adviceLabel: 'Заменить', actionLabel: 'Снять с очереди на 7 дней', headline: 'Результат сильно ниже нормы: стоит снять с очереди.', lines: ['Рейтинг 52 из 100 за 90 решений.'] };
const person = (n: string, status: string, rating: number) => ({ adminId: `id-${n}`, name: n, workspace: 'mass', rating, status, flags: [], decisions: 90 });
const full: Today = {
  computedAt: '2026-10-27T10:00:00.000Z',
  decision: { code: 'appeal', title: 'Жалоба на главного ждёт ответа', text: 'Открытых жалоб: 2.', href: '/staff/appeals' },
  appeals: { open: 2, newest: [{ id: 'a1', number: 7, kind: 'pressure', status: 'new', headName: 'Олег Главный', createdAt: '2026-10-26T08:00:00Z' }] },
  flags: { open: 1 },
  shortlist: { snapshotDate: '2026-10-27', worst: [person('Пётр', 'red', 52)], best: [person('Анна', 'green', 97)] },
  suggestions: { open: 4, items: [{ id: 's1', adminId: 'id-Пётр', name: 'Пётр', workspace: 'mass', kind: 'pull', createdAt: '2026-10-27T01:00:00Z', recommendation: rec }] },
  anomalies: { day: '2026-10-27', total: 3, items: [{ adminId: 'id-Пётр', name: 'Пётр', rule: 'too_fast', ruleLabel: 'решает слишком быстро', score: 12 }] },
  piecework: { disputedDays: 2 },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TodayPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockImplementation((url: string) =>
    Promise.resolve(
      url === '/admin/system-health'
        ? { data: { data: { overall: 'green' } } }
        : { data: { data: { today: { revenueUsd: 120, costUsd: 20, profitUsd: 100 } } } },
    ),
  );
});
afterEach(() => {
  cleanup();
  staffGet.mockReset();
  apiGet.mockReset();
  todayResult = { ok: false, missing: true };
  digestResult = { ok: false, missing: true };
});

describe('«Сегодня»', () => {
  it('shows the decision of the day and every block from ONE snapshot', async () => {
    todayResult = { ok: true, data: full };
    renderPage();
    expect((screen.getByTestId('today-decision')).textContent).toContain('Жалоба на главного ждёт ответа');
    expect((screen.getByTestId('today-appeals')).textContent).toContain('№7 · на Олег Главный');
    expect((screen.getByTestId('today-flags')).textContent).toContain('Открытых: 1');
    const sl = screen.getByTestId('today-shortlist');
    expect(within(sl).getByText('Пётр')).toBeTruthy();
    expect(within(sl).getByText('Анна')).toBeTruthy();
    expect((screen.getByTestId('today-suggestions')).textContent).toContain('Заменить');
    expect((screen.getByTestId('today-suggestions')).textContent).toContain('Рейтинг 52 из 100 за 90 решений.');
    expect((screen.getByTestId('today-anomalies')).textContent).toContain('решает слишком быстро');
    expect((screen.getByTestId('today-piecework')).textContent).toContain('Дней на удержании: 2');
    // the page itself reads no other staff route (the snapshot hook is the only one)
    expect(staffGet).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('today-health').textContent).toContain('Всё в порядке'));
    await waitFor(() => expect(screen.getByTestId('today-money').textContent).toContain('Доход'));
  });

  it('a switched-off block says so instead of failing', () => {
    todayResult = { ok: true, data: { ...full, decision: null, appeals: null, flags: null, shortlist: null, suggestions: null, anomalies: null, piecework: null } };
    renderPage();
    expect((screen.getByTestId('today-nothing')).textContent).toContain('ничего решать не нужно');
    for (const id of ['today-appeals', 'today-flags', 'today-shortlist', 'today-suggestions', 'today-anomalies', 'today-piecework']) {
      expect((screen.getByTestId(id)).textContent).toContain('Сейчас выключено');
    }
  });

  it('empty lists give calm one-line states', () => {
    todayResult = {
      ok: true,
      data: { ...full, decision: null, appeals: { open: 0, newest: [] }, flags: { open: 0 }, shortlist: { snapshotDate: null, worst: [], best: [] }, suggestions: { open: 0, items: [] }, anomalies: { day: null, total: 0, items: [] }, piecework: { disputedDays: 0 } },
    };
    renderPage();
    expect((screen.getByTestId('today-appeals')).textContent).toContain('Открытых жалоб нет');
    expect((screen.getByTestId('today-shortlist')).textContent).toContain('Рейтинга ещё нет');
    expect((screen.getByTestId('today-suggestions')).textContent).toContain('Предложений нет');
    expect((screen.getByTestId('today-piecework')).textContent).toContain('Спорных дней нет');
  });

  it('when the whole route answers 404 (switch off) the page explains how to turn it on', () => {
    todayResult = { ok: false, missing: true };
    renderPage();
    expect(screen.getByText('Страница «Сегодня» выключена')).toBeTruthy();
  });

  it('health and money failing (404) do not break the page', async () => {
    todayResult = { ok: true, data: full };
    apiGet.mockRejectedValue(new Error('404'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('today-health').textContent).toContain('Состояние пока не получено'));
    await waitFor(() => expect(screen.getByTestId('today-money').textContent).toContain('Расчёта за сегодня ещё нет'));
  });

  it('shows the last weekly digest when there is one', () => {
    todayResult = { ok: true, data: full };
    digestResult = { ok: true, data: { items: [{ weekStart: '2026-10-19', numbers: { decisions: 1234, returnedPct: 3.5, appeals: 2, worstCount: 3, bestCount: 4, worstName: null, bestName: null, pieceworkCents: 98765, currency: 'usd' } }] } };
    renderPage();
    const d = screen.getByTestId('today-digest');
    expect((d).textContent).toContain('1234');
    expect((d).textContent).toContain('3,5 %');
  });
});
