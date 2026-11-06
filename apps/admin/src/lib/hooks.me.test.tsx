import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ api: { GET: get } }));

import { useMe } from './hooks';
import { REFERENCE_STALE_MS } from './query-client';

function mount(updatedAt: number) {
  const qc = new QueryClient();
  // «me» is a reference key: the real client keeps it fresh this long.
  qc.setQueryDefaults(['me'], { staleTime: REFERENCE_STALE_MS });
  qc.setQueryData(['me'], { id: 'a', avatarUrl: null }, { updatedAt });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMe(), { wrapper });
}

function comeBackToTab() {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { data: { id: 'a', avatarUrl: 'https://media.lawbid.dev/new_w256.webp' } } });
});

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
});

// R-382 (owner 2026-11-04): a photo saved in the app reaches an open panel.
describe('useMe on coming back to the tab', () => {
  it('re-reads stale «me» and gets the new photo', async () => {
    const { result } = mount(Date.now() - REFERENCE_STALE_MS - 60_000);
    get.mockClear();
    comeBackToTab();
    await waitFor(() => expect(result.current.data?.avatarUrl).toBe('https://media.lawbid.dev/new_w256.webp'));
  });

  it('does not ask the server while «me» is fresh', async () => {
    const { result } = mount(Date.now());
    comeBackToTab();
    await act(async () => {
      await Promise.resolve();
    });
    expect(get).not.toHaveBeenCalled();
    expect(result.current.data?.avatarUrl).toBeNull();
  });
});
