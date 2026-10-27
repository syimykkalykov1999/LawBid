import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/hooks';

let currentMe: Me | undefined;
const get = vi.fn();
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: currentMe }) }));
vi.mock('@/lib/api/client', () => ({ api: { GET: (...a: unknown[]) => get(...a) } }));

import { StaffWatermark } from './staff-watermark';

const me = (over: Partial<Me>) =>
  ({ id: 'a', role: 'support', workspace: 'mass', ...over }) as Me;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StaffWatermark />
    </QueryClientProvider>,
  );
}

describe('StaffWatermark (staff package T11)', () => {
  beforeEach(() => {
    get.mockReset();
  });
  afterEach(cleanup);

  it('off on the server: nothing is drawn', async () => {
    currentMe = me({});
    get.mockResolvedValue({ data: { data: { enabled: false, text: '' } } });
    mount();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByTestId('staff-watermark')).toBeNull();
  });

  it('on: a click-through full-screen layer with the admin name', async () => {
    currentMe = me({});
    get.mockResolvedValue({ data: { data: { enabled: true, text: 'anna.k · 3f2b8a52' } } });
    mount();
    const layer = await screen.findByTestId('staff-watermark');
    expect(layer.style.pointerEvents).toBe('none');
    expect(layer.style.position).toBe('fixed');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.textContent).toContain('anna.k · 3f2b8a52');
  });

  it('the owner and other workspaces never ask the server and see nothing', async () => {
    for (const who of [
      me({ role: 'super_admin', workspace: 'owner' }),
      me({ workspace: 'finance', role: 'finance' }),
      undefined,
    ]) {
      currentMe = who;
      get.mockResolvedValue({ data: { data: { enabled: true, text: 'x' } } });
      mount();
      cleanup();
    }
    expect(get).not.toHaveBeenCalled();
  });
});
