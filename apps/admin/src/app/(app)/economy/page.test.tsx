import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/** R-370: «Экономика» stood on one empty skeleton until the report came.
 * The frame and every section title now show at once. */
vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: { GET: vi.fn(() => new Promise(() => undefined)), PATCH: vi.fn() },
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import EconomyPage from './page';

afterEach(cleanup);

describe('«Экономика» page (R-370)', () => {
  it('shows every section title while the report is still loading', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <EconomyPage />
        </ToastProvider>
      </QueryClientProvider>,
    );
    for (const t of [
      'На что уходят деньги',
      'Правило',
      'Контейнеры и потолок',
      'База данных и Redis',
      'Что было',
      'Запасная сумма AWS и дневной тормоз',
    ]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.queryByText('Расходы в норме')).toBeNull();
  });
});
