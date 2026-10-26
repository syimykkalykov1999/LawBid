import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import type { SpendReport } from '@/lib/launch';

const vendor = (o: Partial<SpendReport['vendors'][number]>): SpendReport['vendors'][number] => ({
  id: 'aws',
  label: 'AWS (серверы, база, хранение)',
  status: 'ok',
  error: null,
  updatedAt: '2026-10-25T06:25:00Z',
  monthToDateUsd: 10,
  lastMonthUsd: 40,
  forecastUsd: 30,
  coveredByCreditsUsd: 30,
  balanceUsd: null,
  daily: [
    { date: '2026-10-23', usd: 1 },
    { date: '2026-10-24', usd: 2 },
  ],
  lines: [{ label: 'Amazon ECS', usd: 8, note: null }],
  freeTier: null,
  notes: [],
  ...o,
});

const report: SpendReport = {
  generatedAt: '2026-10-25T10:00:00Z',
  refreshedAt: '2026-10-25T06:25:00Z',
  vendors: [
    vendor({}),
    vendor({
      id: 'cloudflare',
      label: 'Cloudflare (звонки и фото)',
      monthToDateUsd: 0,
      coveredByCreditsUsd: null,
      daily: [],
      lines: [],
      freeTier: { label: 'Бесплатный трафик звонков', used: 250, free: 1000, unit: 'ГБ' },
    }),
    vendor({
      id: 'twilio',
      label: 'Twilio (SMS-коды)',
      status: 'stale',
      error: 'Twilio HTTP 503',
      monthToDateUsd: 5,
      coveredByCreditsUsd: null,
      balanceUsd: 20,
    }),
    vendor({ id: 'bunny', label: 'Bunny (видео)', status: 'nodata', monthToDateUsd: null, lastMonthUsd: null, forecastUsd: null, coveredByCreditsUsd: null, daily: [], lines: [] }),
  ],
  fixed: [{ id: 'c1', label: 'Apple Developer', usd: 99, period: 'year', paidMonth: null, monthlyUsd: 8.25 }],
  prices: [
    {
      key: 'cf_realtime_per_gb',
      label: 'Звонки Cloudflare: цена за ГБ',
      unit: '$ за ГБ',
      value: 0.05,
      defaultValue: 0.05,
      edited: false,
      sourceUrl: 'https://developers.cloudflare.com/realtime/turn/faq/',
      checkedAt: '2026-10-24',
    },
  ],
  total: { monthToDateUsd: 18.25, forecastUsd: 60, marginPercent: 20, keepOnAccountUsd: 72, fixedMonthUsd: 8.25, stripeFeesUsd: 3.4 },
};

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn(async (path: string) => ({
      data: {
        data:
          path === '/admin/spend/registry'
            ? {
                generatedAt: '2026-10-25T10:00:00Z',
                spendRefreshedAt: null,
                rows: [],
                unclaimed: [],
                ladder: { dayOne: { aws: [263, 263], vendors: [12, 22], all: [275, 285] }, scenarios: [], monthToDateUsd: null, projectedUsd: null },
              }
            : report,
      },
    })),
    POST: vi.fn(async () => ({ data: { data: report } })),
    PUT: vi.fn(async () => ({ data: { data: report } })),
  },
}));
vi.mock('@/lib/live', () => ({ livePoll: () => false }));

import SpendPage from './page';

afterEach(cleanup);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SpendPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('«Расходы» page', () => {
  it('shows how much to keep on the account, with the margin explained', async () => {
    renderPage();
    const total = await screen.findByTestId('spend-total');
    expect(total.textContent).toContain('$72');
    expect(total.textContent).toContain('запас 20%');
    expect(total.textContent).toContain('Комиссия Stripe (отдельно)');
  });

  it('per vendor: credits, free-tier bar, stale and no-data states in plain words', async () => {
    renderPage();
    const aws = await screen.findByTestId('vendor-aws');
    expect(aws.textContent).toContain('Покрыто кредитами: $30');
    expect(aws.textContent).toContain('Amazon ECS');
    const cf = screen.getByTestId('vendor-cloudflare');
    expect(cf.textContent).toContain('250 из 1000 ГБ');
    expect(cf.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
    const tw = screen.getByTestId('vendor-twilio');
    expect(tw.textContent).toContain('Сервис не ответил, показаны прошлые цифры');
    expect(tw.textContent).toContain('Twilio HTTP 503');
    expect(tw.textContent).toContain('Остаток на счёте у сервиса: $20');
    const bunny = screen.getByTestId('vendor-bunny');
    expect(bunny.textContent).toContain('нет данных');
  });

  it('lists the fixed costs and the editable prices with their source and date', async () => {
    renderPage();
    expect(await screen.findByDisplayValue('Apple Developer')).toBeTruthy();
    expect(screen.getByText(/проверено 2026-10-24/)).toBeTruthy();
    expect(screen.getByText('источник').getAttribute('href')).toContain('cloudflare.com');
  });
});
