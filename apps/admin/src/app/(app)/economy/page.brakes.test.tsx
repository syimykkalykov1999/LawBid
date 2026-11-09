import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/** Owner 2026-11-08: two brakes, each braking only what it controls. The
 * page shows the third-party total against the rule, the AWS total
 * against the AWS budget, and both together. */
const container = { running: 1, desired: 1, ceiling: 4, hardCap: 50, taskUsd: 18 };
const report = (over: { guard?: 'ok' | 'limited'; scaleMode?: 'min' | 'normal' | null } = {}) => ({
  enabled: true,
  guard: over.guard ?? 'ok',
  since: '2026-11-08T06:10:00.000Z',
  figures: {
    revenue30dUsd: 0,
    revenueMonthUsd: 0,
    allowedUsd: 350,
    lines: [],
    monthToDateUsd: 98,
    projectedUsd: 471,
    thirdPartyMonthToDateUsd: 20,
    thirdPartyProjectedUsd: 30,
    awsMonthToDateUsd: 78,
    awsProjectedUsd: 441,
    awsLimitUsd: 450,
  },
  settings: {
    percent: 50,
    thresholdUsd: 350,
    ceilingMode: 'auto',
    manualApi: 4,
    manualWorker: 2,
    awsFallbackUsd: 150,
    dailyBrakeDays: 3,
    ceilingUpWindowMin: 10,
    ceilingDownWindowMin: 30,
    ceilingTolerancePercent: 10,
  },
  containers: { onAws: true, api: container, worker: container, scaleMode: over.scaleMode ?? 'normal' },
  capacity: {
    onAws: false,
    at: null,
    dbClass: null,
    dbNext: null,
    dbCpuPercent: null,
    dbConnections: null,
    dbMaxConnections: null,
    dbStorageGb: null,
    dbStorageUsd: null,
    redisClass: null,
    redisNext: null,
    redisMemoryPercent: null,
    dbTiers: [],
    redisTiers: [],
  },
  events: [],
});

const get = vi.fn();
vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: { GET: (...a: unknown[]) => get(...a), PATCH: vi.fn() },
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import EconomyPage from './page';

afterEach(cleanup);

function show(r: ReturnType<typeof report>) {
  get.mockResolvedValue({ data: { data: r } });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <EconomyPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('«Экономика»: two brakes (owner 2026-11-08)', () => {
  it('shows the third-party total, the AWS total against its budget, and both together', async () => {
    show(report());
    expect(await screen.findByText('Сторонние платные сервисы, прогноз за месяц')).toBeTruthy();
    expect(screen.getByText('$30')).toBeTruthy();
    expect(screen.getByText('AWS (серверы, база, трафик, письма), прогноз за месяц')).toBeTruthy();
    expect(screen.getByText('$441')).toBeTruthy();
    expect(screen.getByText(/Бюджет AWS: \$450/)).toBeTruthy();
    expect(screen.getByText(/Всего за месяц \(оба вместе\): прогноз \$471/)).toBeTruthy();
    // A high AWS bill alone is no third-party limit.
    expect(screen.getByText('Расходы в норме')).toBeTruthy();
  });

  it('the third-party brake says it never touches AWS servers', async () => {
    show(report({ guard: 'limited' }));
    expect(await screen.findByText(/Серверы AWS этот тормоз не трогает/)).toBeTruthy();
  });

  it('the AWS brake says video and SMS keep working', async () => {
    show(report({ scaleMode: 'min' }));
    expect(await screen.findByText(/видео и SMS работают/)).toBeTruthy();
  });
});
