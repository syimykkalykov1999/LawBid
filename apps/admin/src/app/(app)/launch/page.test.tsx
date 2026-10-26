import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import type { LaunchReport, PagingStatus } from '@/lib/launch';

const calls: string[] = [];
let report: LaunchReport;
let paging: PagingStatus;

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn(async (path: string) => ({ data: { data: path.endsWith('pagerduty') ? paging : report } })),
    POST: vi.fn(async (path: string) => {
      calls.push(path);
      return { data: { data: path.includes('pagerduty') ? paging : report } };
    }),
  },
}));
vi.mock('@/lib/live', () => ({ livePoll: () => false }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import LaunchPage from './page';

const item = (o: Partial<LaunchReport['items'][number]>): LaunchReport['items'][number] => ({
  id: 'x',
  group: 'money',
  title: 'Шаг',
  status: 'green',
  detail: 'Всё хорошо.',
  hint: null,
  runbook: null,
  manualTick: false,
  ticked: false,
  action: null,
  ...o,
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <LaunchPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  paging = {
    available: true,
    configured: true,
    endpointMasked: 'https://events.pagerduty.com/integration/AAAA…4444/enqueue',
    state: 'confirmed',
    stale: false,
    checkedAt: '2026-10-25T10:00:00Z',
  };
  report = {
    generatedAt: '2026-10-25T10:00:00Z',
    greenCount: 1,
    total: 3,
    items: [
      item({ id: 'dns', group: 'release', title: 'Домен через Cloudflare', status: 'green' }),
      item({ id: 'budget', title: 'Потолок расходов', status: 'red', detail: 'Потолок 50 $.', hint: 'Поднимите на «Масштабе».' }),
      item({ id: 'sign_required', group: 'safety', title: 'SIGN_REQUIRED', status: 'manual', manualTick: true, detail: 'Автоматически не проверяется.' }),
    ],
  };
});
afterEach(cleanup);

describe('«Запуск» page', () => {
  it('shows the progress, the lights and the hint only for what is not done', async () => {
    renderPage();
    expect(await screen.findByText('Готово 1 из 3. Осталось 2.')).toBeTruthy();
    expect(screen.getByText('Домен через Cloudflare')).toBeTruthy();
    expect(screen.getByText('Не готово')).toBeTruthy();
    expect(screen.getByText('Что делать: Поднимите на «Масштабе».')).toBeTruthy();
    expect(screen.getByText('Отметьте сами')).toBeTruthy();
  });

  it('a step nothing can detect has a checkbox that posts the tick', async () => {
    renderPage();
    const box = await screen.findByRole('checkbox');
    fireEvent.click(box);
    await waitFor(() => expect(calls).toContain('/admin/launch/ticks/{id}'));
  });

  it('shows the PagerDuty state without the whole key, and sends the test alarm only after a confirm', async () => {
    renderPage();
    expect(await screen.findByText('Подтверждена (Confirmed)')).toBeTruthy();
    expect(screen.getByText(/AAAA…4444/)).toBeTruthy();
    fireEvent.click(screen.getByText('Отправить тестовую тревогу'));
    expect(calls).not.toContain('/admin/launch/pagerduty/test');
    fireEvent.click(await screen.findByText('Отправить'));
    await waitFor(() => expect(calls).toContain('/admin/launch/pagerduty/test'));
  });

  it('the test button waits until the subscription is Confirmed', async () => {
    paging = { ...paging, state: 'pending' };
    renderPage();
    await screen.findByText('Ждёт (Pending)');
    const btn = screen.getByText('Отправить тестовую тревогу').closest('button')!;
    expect(btn.disabled).toBe(true);
  });
});
