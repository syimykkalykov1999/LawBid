import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  api: { GET: (...a: unknown[]) => apiGet(...a), POST: vi.fn() },
}));

import { DbSplitCard } from './db-split-card';

function renderCard(enabled: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DbSplitCard enabled={enabled} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiGet.mockReset();
});

describe('«Разделить базу» on «Масштаб» (switch scale.db_split_enabled)', () => {
  it('switch off: the old placeholder, nothing is fetched', () => {
    renderCard(false);
    const card = screen.getByTestId('db-split-card');
    expect(card.textContent).toContain('Пока недоступно');
    expect(screen.getByRole('button', { name: 'Разделить базу' })).toHaveProperty('disabled', true);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('switch on: the step list from the overview, «Проверить» runs the dry plan, commands and guide are named', async () => {
    apiGet.mockImplementation((url: string) =>
      Promise.resolve(
        url === '/admin/shards/overview'
          ? { data: { data: { databases: ['db0', 'db1'], distribution: [], moves: [], leaseHeld: false, orphans: null } } }
          : {
              data: {
                data: {
                  fromDb: 'db0',
                  toDb: 'db1',
                  shards: [200, 201, 202],
                  rows: 5000,
                  estimatedSeconds: 120,
                  readiness: { configured: true, reachable: true, migrationsApplied: true, missingMigrations: 0, crossFamilyFksLeft: 0, ok: true, problems: [] },
                },
              },
            },
      ),
    );
    renderCard(true);
    await waitFor(() => expect(screen.getByTestId('db-split-step-configured').textContent).toContain('прописана'));
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('db-split-card').textContent).toContain('Проверка готовности');
    expect(screen.getByTestId('db-split-step-reachable').textContent).toContain('Проверяется кнопкой');

    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await waitFor(() => expect(screen.getByTestId('db-split-card').textContent).toContain('Можно начинать'));
    expect(apiGet).toHaveBeenCalledWith('/admin/shards/split-plan', { params: { query: { toDb: 'db1' } } });
    expect(screen.getByTestId('db-split-step-plan').textContent).toContain('Переедет частей: 3');

    const card = screen.getByTestId('db-split-card');
    expect(within(card).getByRole('link', { name: 'Открыть инструкцию' }).getAttribute('href')).toBe('/guides/db-split');
    expect(within(card).getByRole('link', { name: 'К переносу («Здоровье системы»)' }).getAttribute('href')).toBe('/system-health');
    expect(card.textContent).toContain('npm run shard:move --workspace apps/api -- split-plan db1');
    // no destructive button here
    expect(screen.queryByRole('button', { name: 'Разделить базу' })).toBeNull();
  });

  it('switch on, second database missing: the first step is red with what to do', async () => {
    apiGet.mockResolvedValue({ data: { data: { databases: ['db0'], distribution: [], moves: [], leaseHeld: false, orphans: null } } });
    renderCard(true);
    await waitFor(() => expect(screen.getByTestId('db-split-step-configured').textContent).toContain('Создайте вторую базу'));
  });
});
