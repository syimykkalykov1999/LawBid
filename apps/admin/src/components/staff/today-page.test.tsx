import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Today } from '@/lib/staff-data';

let todayResult: { ok: true; data: Today } | { ok: false; missing: true } = { ok: false, missing: true };
let digestResult: unknown = { ok: false, missing: true };
let systemResult: unknown = { ok: false, missing: true };
const staffPost = vi.fn();
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
    staffPost: (...a: unknown[]) => staffPost(...a),
    useToday: () => ({ data: todayResult, isPending: false, error: null }),
    useDigest: () => ({ data: digestResult, isPending: false }),
    useTodaySystem: () => ({ data: systemResult, isPending: false }),
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
        ? { data: { data: { overall: 'green', items: [] } } }
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
  systemResult = { ok: false, missing: true };
  staffPost.mockReset();
});

const sentryOk = { state: 'ok', unresolved: 12, unresolvedAtLeast: false, newCount: 3, issues: [{ id: '77', title: 'TypeError in chat', count: 9, users: 2, firstSeen: 'x', lastSeen: 'x', permalink: 'https://sentry.io/i/77' }], url: 'https://sentry.io/org/issues', error: null, computedAt: 'x' };
const systemFull = {
  ok: true,
  data: {
    computedAt: '2026-10-27T10:00:00.000Z',
    freshSec: 300,
    counts: { critical: 1, high: 0, medium: 1, low: 0 },
    items: [
      { code: 'cost_80', severity: 'medium', title: 'Потрачено больше 80 % месячного бюджета', why: 'Потрачено $170 из $200.', action: { kind: 'guide', target: 'aws-budget-ceiling', label: 'Открыть инструкцию' } },
      { code: 'worker_down', severity: 'critical', title: 'Фоновый обработчик молчит', why: 'Нет сердцебиения.', action: { kind: 'route', target: '/system-health', label: 'Открыть «Здоровье системы»' } },
      { code: 'launch_dns', severity: 'high', title: 'Шаг запуска: Домен в Cloudflare', why: 'Перенесите NS.', action: { kind: 'launch', target: 'dns', label: 'Открыть инструкцию' } },
    ],
    sentry: sentryOk,
  },
};

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

  it('«Система»: server items and live lights in one list by urgency, each with its button', async () => {
    todayResult = { ok: true, data: full };
    systemResult = systemFull;
    apiGet.mockImplementation((url: string) =>
      Promise.resolve(
        url === '/admin/system-health'
          ? { data: { data: { overall: 'yellow', items: [{ key: 'queues', status: 'yellow', detail: { failed: 2, dlq: 0, oldestSec: 10 } }, { key: 'redis', status: 'green', detail: {} }] } } }
          : { data: { data: { today: null } } },
      ),
    );
    renderPage();
    const list = await screen.findByTestId('today-system-items');
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(4));
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['today-system-worker_down', 'today-system-launch_dns', 'today-system-cost_80', 'today-system-live_queues']);
    expect(rows[0].textContent).toContain('Срочно');
    expect(within(rows[0]).getByRole('link', { name: 'Открыть «Здоровье системы»' }).getAttribute('href')).toBe('/system-health');
    expect(within(rows[1]).getByRole('link', { name: 'Открыть инструкцию' }).getAttribute('href')).toBe('/guides?step=dns');
    expect(within(rows[2]).getByRole('link', { name: 'Открыть инструкцию' }).getAttribute('href')).toBe('/guides/aws-budget-ceiling');
    expect(rows[3].textContent).toContain('упавших задач: 2');
    expect(screen.getByTestId('today-health').textContent).toContain('Есть на что посмотреть');
  });

  it('«Система»: nothing to do is one calm line; Sentry off is explained', async () => {
    todayResult = { ok: true, data: full };
    systemResult = { ok: true, data: { ...systemFull.data, items: [], counts: { critical: 0, high: 0, medium: 0, low: 0 }, sentry: { ...sentryOk, state: 'off', issues: [], url: null } } };
    renderPage();
    await waitFor(() => expect(screen.getByTestId('today-system-empty').textContent).toContain('ничего не требуется'));
    expect(screen.getByTestId('today-sentry').textContent).toContain('Сейчас выключено');
    expect(screen.queryByRole('button', { name: 'Решено' })).toBeNull();
  });

  it('Sentry line: numbers, «Открыть» and «Решено» (one POST, then the list is reloaded)', async () => {
    todayResult = { ok: true, data: full };
    systemResult = systemFull;
    staffPost.mockResolvedValue({ ...sentryOk, newCount: 2, unresolved: 11, issues: [] });
    renderPage();
    const line = await screen.findByTestId('today-sentry');
    expect(line.textContent).toContain('Ошибки в приложении: 3 новых / 12 нерешённых');
    expect(within(line).getByRole('link', { name: 'Открыть' }).getAttribute('href')).toBe('https://sentry.io/org/issues');
    within(line).getByRole('button', { name: 'Решено' }).click();
    await waitFor(() => expect(staffPost).toHaveBeenCalledWith('/admin/staff/today/sentry/77/resolve'));
    expect(staffPost).toHaveBeenCalledTimes(1);
  });
});
