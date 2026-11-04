import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import type { Health } from '@/lib/scale';

/** R-369: «Масштаб» stood on one empty skeleton until the slowest of five
 * requests answered. Each block now shows as soon as its own data is here. */
const pending = new Map<string, Promise<unknown>>();
const answers = new Map<string, unknown>();

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn((path: string) => {
      const slow = pending.get(path);
      if (slow) return slow;
      return Promise.resolve({ data: { data: answers.get(path) ?? {} } });
    }),
    POST: vi.fn(),
    PATCH: vi.fn(),
  },
}));
vi.mock('@/lib/live', () => ({ livePoll: () => false }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Cards with their own requests are not what this test is about.
vi.mock('@/components/backfills-card', () => ({ BackfillsCard: () => null }));
vi.mock('@/components/scale-switches', () => ({ ScaleSwitches: () => null }));
vi.mock('@/components/search-index-card', () => ({ SearchIndexCard: () => null }));
vi.mock('@/components/scale/db-split-card', () => ({ DbSplitCard: () => null }));
vi.mock('./heavy-users-card', () => ({ HeavyUsersCard: () => null }));
vi.mock('@/app/(app)/spend/registry', () => ({ StateControl: () => null }));
vi.mock('@/components/infra-plan-sheet', () => ({
  InfraChip: () => null,
  InfraPlanSheet: () => null,
  InfraSuggestionCards: () => null,
  useInfra: () => ({
    data: undefined,
    q: { refetch: vi.fn() },
    create: { mutate: vi.fn(), isPending: false },
    confirm: { mutate: vi.fn(), isPending: false },
    cancel: { mutate: vi.fn() },
    rollback: { mutate: vi.fn(), isPending: false },
  }),
}));

import ScalePage from './page';

const health = {
  overall: 'green',
  items: [],
  incidents: [],
  actions: { onAws: true },
  scaleMode: { mode: 'normal' },
} as unknown as Health;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ScalePage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  pending.clear();
  answers.clear();
  answers.set('/admin/system-health', health);
  answers.set('/admin/system-health/scale', { searchEngine: 'postgres' });
  answers.set('/admin/launch/budgets', { available: false, items: [] });
  answers.set('/admin/spend/registry', { rows: [] });
});
afterEach(cleanup);

describe('«Масштаб» page (R-369)', () => {
  it('shows the alarms and the emergency button while the economy numbers are still loading', async () => {
    pending.set('/admin/economy', new Promise(() => undefined)); // AWS is slow
    renderPage();
    expect(await screen.findByText('Тревог нет')).toBeTruthy();
    expect(screen.getByText('Держать минимум')).toBeTruthy();
    expect(screen.getByText('Бюджеты читаются только на AWS (боевой сервер).')).toBeTruthy();
    // Only the blocks that need the economy report wait.
    expect(screen.queryByText('Сохранить потолок')).toBeNull();
  });

  it('shows the budgets even when the health board has not answered yet', async () => {
    pending.set('/admin/system-health', new Promise(() => undefined));
    pending.set('/admin/economy', new Promise(() => undefined));
    renderPage();
    expect(await screen.findByText('Бюджеты читаются только на AWS (боевой сервер).')).toBeTruthy();
    expect(screen.getByText('Масштаб')).toBeTruthy();
    expect(screen.queryByText('Тревог нет')).toBeNull();
  });
});
