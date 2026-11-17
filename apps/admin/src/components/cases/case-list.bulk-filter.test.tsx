import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Owner 14.11 (row 179 follow-up B6): «Выбрать всё по фильтру» on the cases
 * list asks the server to count the FILTER (one call) instead of walking
 * every page in the browser, and the bulk action sends the filter.
 */
const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api/client', () => ({
  api: { GET: (...a: unknown[]) => get(...a), POST: (...a: unknown[]) => post(...a) },
  errorText: String,
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { role: 'super_admin', bulkSelectCap: null } }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/cases',
}));
vi.mock('@/components/ui/hover-prefetch-link', () => ({
  HoverPrefetchLink: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/ui/virtual-rows', () => ({
  VirtualRows: <T,>({ rows, children }: { rows: T[]; children: (r: T, i: number, vp: object) => ReactNode }) => (
    <>{rows.map((r, i) => children(r, i, {}))}</>
  ),
}));

import { CaseList } from './case-list';

const row = (id: string) => ({
  id,
  title: `Case ${id}`,
  status: 'open',
  clientId: 'c',
  clientName: 'Client',
  stateCode: 'NV',
  bidsCount: 0,
  openReports: 0,
  promoted: false,
  practiceAreaName: 'Family',
  dossierMissing: [],
  photos: 0,
  documents: 0,
  createdAt: '2026-11-01T00:00:00Z',
  lastActivityAt: '2026-11-01T00:00:00Z',
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CaseList />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/cases?status=open&reports=1');
  get.mockReset();
  post.mockReset();
  // Two pages: the old «select all» walked them in the browser.
  get.mockImplementation(async (_p: string, o: { params: { query: { cursor?: string } } }) =>
    o.params.query.cursor
      ? { data: { data: [row('c')], meta: { nextCursor: null } } }
      : { data: { data: [row('a'), row('b')], meta: { nextCursor: 'next' } } },
  );
  post.mockImplementation(async (path: string) =>
    path === '/admin/cases/bulk/preview'
      ? { data: { data: { matched: 3456, capped: false, cap: null } } }
      : { data: { data: { done: ['x'], skipped: [] } } },
  );
});
afterEach(cleanup);

describe('cases: select all by filter on the server', () => {
  it('one preview call with the list filter, no page walk, the count from the server', async () => {
    wrap();
    await screen.findByText('Case a');
    const pagesBefore = get.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByText('Выбрать всё по фильтру'));
    });
    expect(post).toHaveBeenCalledWith('/admin/cases/bulk/preview', {
      body: { filter: { status: 'open', q: undefined, hasReports: true, stateCode: undefined, withDeadline: undefined } },
    });
    expect(get.mock.calls.length).toBe(pagesBefore);
    // ru-RU groups digits with a no-break space
    expect(screen.getByTestId('bulk-count').textContent?.replace(/\s/g, ' ')).toBe('Выбрано: 3 456 кейсов');
  });

  it('the action sends the filter (no ids) after the confirm with the server count', async () => {
    wrap();
    await screen.findByText('Case a');
    await act(async () => {
      fireEvent.click(screen.getByText('Выбрать всё по фильтру'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /В архив/ }));
    });
    expect(await screen.findByText(/^В архив: 3\s456 кейсов\?$/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^В архив \(3\s456\)$/ }));
    });
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/admin/cases/bulk', {
        body: {
          action: 'archive',
          filter: { status: 'open', q: undefined, hasReports: true, stateCode: undefined, withDeadline: undefined },
          reason: '',
        },
      }),
    );
  });
});
