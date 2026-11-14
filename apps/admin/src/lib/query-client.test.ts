import { focusManager, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQueryClient } from '@/lib/query-client';

/**
 * Owner 14.11 (row 179, B5 / detective R3A-6): a threshold the owner changed
 * on his phone must not sit old for up to 15 minutes in the laptop tab.
 * `config` and `flags` re-read when the tab gets focus again, even while
 * fresh (TanStack `refetchOnWindowFocus: 'always'`; the server answers 304
 * when nothing changed). Other reference data keep the 15 minutes.
 */
describe('settings and switches re-read on window focus', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.restoreAllMocks();
  });

  async function focusCount(key: string): Promise<number> {
    const qc = makeQueryClient();
    // QueryClientProvider mounts the client: that is what listens to focus.
    qc.mount();
    const fn = vi.fn(() => Promise.resolve([]));
    const obs = new QueryObserver(qc, { queryKey: [key], queryFn: fn });
    const off = obs.subscribe(() => undefined);
    expect(String(obs.options.refetchOnWindowFocus)).toBe(key === 'countries' ? 'false' : 'always');
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((r) => setTimeout(r, 20));
    off();
    qc.unmount();
    return fn.mock.calls.length;
  }

  it('config: a second read on focus', async () => {
    expect(await focusCount('config')).toBe(2);
  });

  it('flags: a second read on focus', async () => {
    expect(await focusCount('flags')).toBe(2);
  });

  it('countries (other reference data): no extra read', async () => {
    expect(await focusCount('countries')).toBe(1);
  });
});
