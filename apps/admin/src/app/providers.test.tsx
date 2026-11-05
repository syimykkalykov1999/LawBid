import { useMutation, useQueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countsQuery } from '@/lib/live';
import { Providers } from './providers';

/** R-403: any successful action re-reads the sidebar badges at once. */
describe('Providers', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });
  afterAll(() => vi.unstubAllGlobals());

  function Action({ run, spy }: { run: () => Promise<unknown>; spy: (k: unknown) => void }) {
    const qc = useQueryClient();
    const m = useMutation({ mutationFn: run, onError: () => undefined });
    useEffect(() => {
      const real = qc.invalidateQueries.bind(qc);
      qc.invalidateQueries = ((f: { queryKey?: unknown }) => {
        spy(f?.queryKey);
        return real(f as never);
      }) as typeof qc.invalidateQueries;
      m.mutate();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
    }, []);
    return <p>{m.status}</p>;
  }

  it('invalidates the badges after a mutation succeeded', async () => {
    const spy = vi.fn();
    render(
      <Providers>
        <Action run={() => Promise.resolve('ok')} spy={spy} />
      </Providers>,
    );
    await screen.findByText('success');
    await waitFor(() => expect(spy).toHaveBeenCalledWith(countsQuery.queryKey));
  });

  it('does not touch the badges after a failed mutation', async () => {
    const spy = vi.fn();
    render(
      <Providers>
        <Action run={() => Promise.reject(new Error('nope'))} spy={spy} />
      </Providers>,
    );
    await screen.findByText('error');
    expect(spy).not.toHaveBeenCalled();
  });
});
