'use client';

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import type { Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { PERSISTED_GC_MS, queryClassOf } from '@/lib/query-client';

/**
 * Speed matrix 2026-11-09 (§3 #4, «кэш админки живёт только в памяти»): the
 * query cache is also written to the browser's IndexedDB, so a reload, a
 * new tab or the next morning open every list from the stored copy at once
 * and only revalidate it (TanStack Query «Persisting with IndexedDB»:
 * `PersistQueryClientProvider` + an async-storage persister over
 * `idb-keyval`, both from the TanStack / GoogleChromeLabs packages as is).
 *
 * What is stored: successful queries of the reference, aggregate and list
 * classes (lib/query-client.ts) — what the sidebar, the boards and the
 * tables show. Nothing of the `default` class: private reads (a person's
 * contacts, a signed document link, a code) stay in memory only. The copy
 * lives a day (PERSIST_MAX_AGE_MS) and is dropped on sign-out
 * (clearPersistedQueries) and whenever PERSIST_BUSTER changes.
 */
export const PERSIST_KEY = 'lawbid-admin-queries';
/** The same day the persisted classes keep in memory (query-client.ts). */
export const PERSIST_MAX_AGE_MS = PERSISTED_GC_MS;
/** Bump when stored data would no longer match what the pages expect. */
export const PERSIST_BUSTER = '2026-11-09';
/** Writes are coalesced: at most one IndexedDB write per second. */
export const PERSIST_THROTTLE_MS = 1000;

/** Which queries go to disk (PersistQueryClientProvider dehydrateOptions). */
export function shouldPersistQuery(q: Pick<Query, 'queryKey' | 'state'>): boolean {
  return q.state.status === 'success' && queryClassOf(q.queryKey) !== 'default';
}

/** idb-keyval as the persister's storage; any IndexedDB trouble (private
 * window, quota, no IndexedDB in a test) means «nothing stored», never an
 * error on the page. */
export const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return (await get<string>(key)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await set(key, value);
    } catch {
      /* not stored, still right */
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await del(key);
    } catch {
      /* nothing to remove */
    }
  },
};

export function makePersister(storage: typeof idbStorage = idbStorage): Persister {
  return createAsyncStoragePersister({
    key: PERSIST_KEY,
    storage,
    throttleTime: PERSIST_THROTTLE_MS,
  });
}

/** Sign-out: the stored copy must not outlive the session (topbar). */
export async function clearPersistedQueries(storage: typeof idbStorage = idbStorage): Promise<void> {
  await storage.removeItem(PERSIST_KEY);
}
