import { describe, expect, it } from 'vitest';
import { clearPersistedQueries, makePersister, PERSIST_KEY, shouldPersistQuery } from '@/lib/persist';

/** An in-memory stand-in for idb-keyval (the persister's storage). */
function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => Promise.resolve(m.get(k) ?? null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
      return Promise.resolve();
    },
    removeItem: (k: string) => {
      m.delete(k);
      return Promise.resolve();
    },
  };
}

describe('persisted query cache (speed matrix §3 #4)', () => {
  it('stores successful reference / aggregate / list queries, never private reads or failures', () => {
    const ok = { status: 'success' } as never;
    expect(shouldPersistQuery({ queryKey: ['users', { q: 'a' }], state: ok })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ['dashboard'], state: ok })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ['config'], state: ok })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ['admin-counts'], state: ok })).toBe(false);
    expect(shouldPersistQuery({ queryKey: ['verification-doc-url', 'd1'], state: ok })).toBe(false);
    expect(shouldPersistQuery({ queryKey: ['user-contacts', 'u1'], state: ok })).toBe(false);
    expect(shouldPersistQuery({ queryKey: ['users'], state: { status: 'error' } as never })).toBe(false);
    expect(shouldPersistQuery({ queryKey: ['users'], state: { status: 'pending' } as never })).toBe(false);
  });

  it('round-trips a client through the storage and removes it on sign-out', async () => {
    const storage = memory();
    const persister = makePersister(storage);
    const client = { timestamp: 1, buster: 'b', clientState: { queries: [], mutations: [] } };
    await persister.persistClient(client);
    // writes are throttled: wait for the flush
    await new Promise((r) => setTimeout(r, 1100));
    expect(storage.m.has(PERSIST_KEY)).toBe(true);
    expect(await persister.restoreClient()).toEqual(client);
    await clearPersistedQueries(storage);
    expect(storage.m.has(PERSIST_KEY)).toBe(false);
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it('a broken IndexedDB (private window, tests) reads as empty and never throws', async () => {
    const { idbStorage } = await import('@/lib/persist');
    expect(await idbStorage.getItem('x')).toBeNull();
    await expect(idbStorage.setItem('x', 'y')).resolves.toBeUndefined();
    await expect(idbStorage.removeItem('x')).resolves.toBeUndefined();
  });
});
