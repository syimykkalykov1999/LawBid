import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Owner list row 192 (detective R4-C №5): the switches of «Где работает
 * «Перевести»» flip on the FIRST click — before the server answers — and a
 * double click sends one write, not two. Before the fix the knob read the
 * server copy, so it moved only after the round trip and looked dead.
 */
type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
const pending: Pending[] = [];
const config = () => [
  { key: 'translate.scope', value: 'zones', updatedAt: '2026-11-16T00:00:00.000Z' },
  { key: 'translate.chat', value: true, updatedAt: '2026-11-16T00:00:00.000Z' },
  { key: 'translate.posts', value: false, updatedAt: '2026-11-16T00:00:00.000Z' },
];
const flags = () => [{ key: 'chat_translate', enabled: true, updatedAt: '2026-11-16T00:00:00.000Z' }];
const hold = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {
    code = 'X';
  },
  errorText: (e: unknown) => String(e),
  api: {
    GET: vi.fn((path: string) =>
      Promise.resolve({ data: { data: path === '/admin/config' ? config() : flags() } }),
    ),
    PUT: vi.fn(() => hold()),
    PATCH: vi.fn(() => hold()),
  },
}));

import { api } from '@/lib/api/client';
import { TranslateZones } from './translate-zones';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TranslateZones configured />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const zone = (name: string) => screen.getByRole('switch', { name });

beforeEach(() => {
  pending.length = 0;
  vi.mocked(api.PUT).mockClear();
  vi.mocked(api.PATCH).mockClear();
});
afterEach(cleanup);

describe('TranslateZones switches (row 192)', () => {
  it('a zone switch flips on the first click, before the server answers', async () => {
    renderIt();
    await waitFor(() => expect(zone('Лента').getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(zone('Лента'));
    await waitFor(() => expect(zone('Лента').getAttribute('aria-checked')).toBe('true'));
    expect(pending).toHaveLength(1);
    expect(api.PUT).toHaveBeenCalledOnce();
  });

  it('a double click sends one write', async () => {
    renderIt();
    await waitFor(() => expect(zone('Чаты').getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(zone('Чаты'));
    await waitFor(() => expect(zone('Чаты').getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(zone('Чаты'));
    expect(api.PUT).toHaveBeenCalledOnce();
    expect(zone('Чаты').getAttribute('aria-checked')).toBe('false');
  });

  it('a refusal flips the zone back', async () => {
    renderIt();
    await waitFor(() => expect(zone('Лента').getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(zone('Лента'));
    await waitFor(() => expect(zone('Лента').getAttribute('aria-checked')).toBe('true'));
    pending[0].reject(new Error('500'));
    await waitFor(() => expect(zone('Лента').getAttribute('aria-checked')).toBe('false'));
  });

  it('the main switch flips on the first click and sends one write for a double click', async () => {
    renderIt();
    const main = () => screen.getByRole('switch', { name: 'Переводчик включён' });
    await waitFor(() => expect(main().getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(main());
    await waitFor(() => expect(main().getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(main());
    expect(api.PATCH).toHaveBeenCalledOnce();
  });
});
