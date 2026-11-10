import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { optimistic, patchRow } from './optimistic';

/**
 * SPEED_MATRIX 2026-11-09, admin «мгновенное обновление»: before this
 * helper the admin had no `onMutate` anywhere (`setQueryData` only after
 * the server answered) — a switch waited for the round trip. Now the
 * cached value changes at once, is rolled back on an error and re-read
 * when the server has settled.
 */
type Flag = { key: string; enabled: boolean };
const KEY = ['flags'];
const rows: Flag[] = [
  { key: 'a', enabled: false },
  { key: 'b', enabled: true },
];

function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData<Flag[]>(KEY, rows);
  return qc;
}

describe('optimistic', () => {
  it('writes the expected result before the server answers', async () => {
    const qc = client();
    const o = optimistic<Flag[], Flag>(qc, KEY, patchRow((row, v) => ({ ...row, enabled: v.enabled })));
    const ctx = await o.onMutate({ key: 'a', enabled: true });
    expect(qc.getQueryData<Flag[]>(KEY)).toEqual([
      { key: 'a', enabled: true },
      { key: 'b', enabled: true },
    ]);
    expect(ctx.previous).toEqual(rows);
  });

  it('puts the snapshot back on an error and tells the caller', async () => {
    const qc = client();
    const onError = vi.fn();
    const o = optimistic<Flag[], Flag>(qc, KEY, patchRow((row, v) => ({ ...row, enabled: v.enabled })), { onError });
    const vars = { key: 'b', enabled: false };
    const ctx = await o.onMutate(vars);
    expect(qc.getQueryData<Flag[]>(KEY)![1].enabled).toBe(false);
    o.onError(new Error('500'), vars, ctx);
    expect(qc.getQueryData<Flag[]>(KEY)).toEqual(rows);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('re-reads the key from the server when settled', () => {
    const qc = client();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    optimistic<Flag[], Flag>(qc, KEY, (cur) => cur).onSettled();
    expect(spy).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it('leaves the cache alone when nothing is cached yet', async () => {
    const qc = new QueryClient();
    const o = optimistic<Flag[], Flag>(qc, KEY, patchRow((row, v) => ({ ...row, enabled: v.enabled })));
    await o.onMutate({ key: 'a', enabled: true });
    expect(qc.getQueryData(KEY)).toBeUndefined();
  });
});
