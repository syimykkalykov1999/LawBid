import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner 14.11 (row 180, B7 / detective R3A-8): «CSV» downloads what the list
 * shows — the page's filters go with the request (Stripe «Export» of the
 * filtered list), not the whole table.
 */
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { role: 'super_admin' } }) }));
vi.mock('@/lib/rbac', () => ({ can: () => true }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock('@/components/reason-dialog', () => ({ useReason: () => ({ ask: vi.fn(), dialog: null }) }));

import { CsvButton } from './csv-button';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetch = vi.fn(async () => new Response('id\n', { status: 200, headers: { 'content-type': 'text/csv' } }));
  vi.stubGlobal('fetch', fetch);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  return fetch;
}

describe('CsvButton sends the page filters', () => {
  it('only the set filters, as query parameters', async () => {
    const fetch = stubFetch();
    render(<CsvButton entity="cases" query={{ q: 'divorce', status: undefined, stateCode: 'NV', hasReports: false }} />);
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('/api/proxy/export/cases?q=divorce&stateCode=NV');
  });

  it('no filters → the plain address, as before', async () => {
    const fetch = stubFetch();
    render(<CsvButton entity="bids" />);
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('/api/proxy/export/bids');
  });
});
