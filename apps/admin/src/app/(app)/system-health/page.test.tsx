import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/** R-370: «Здоровье системы» — the shard card has its own request and does
 * not wait for the board; the board shows the age of the server copy. */
const pending = new Set<string>();
const board = {
  overall: 'green',
  generatedAt: new Date(Date.now() - 40_000).toISOString(),
  items: [],
  incidents: [],
  heavyPause: null,
  scaleMode: null,
  actions: { onAws: false, budget: false },
  settings: { autoPauseHeavyJobs: true, autoScaleDownOnBudget: true, dbSlowMs: 800, backupMaxAgeHours: 26 },
};

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn((path: string) =>
      pending.has(path) ? new Promise(() => undefined) : Promise.resolve({ data: { data: board } }),
    ),
    POST: vi.fn(),
    PATCH: vi.fn(),
  },
}));
vi.mock('@/lib/live', () => ({ livePoll: () => false }));
vi.mock('@/components/system/shard-split-card', () => ({
  ShardSplitCard: () => <div data-testid="shard-card" />,
}));

import SystemHealthPage from './page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SystemHealthPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  pending.clear();
});

describe('«Здоровье системы» page (R-370)', () => {
  it('the shard card shows while the board is still loading', () => {
    pending.add('/admin/system-health');
    renderPage();
    expect(screen.getByTestId('shard-card')).toBeTruthy();
    expect(screen.queryByText('Всё в порядке')).toBeNull();
  });

  it('«обновлено N с назад» is the age of the server copy, not of the fetch', async () => {
    renderPage();
    expect(await screen.findByText('Всё в порядке')).toBeTruthy();
    expect(screen.getByText(/обновлено/).textContent).toMatch(/^обновлено 4\d с назад$/);
  });
});
