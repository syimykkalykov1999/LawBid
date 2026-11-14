'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Scout 13.11 batch 1 (row 96): list filters, search and tabs live in the
 * address, so a link, «Найти пользователя» in ⌘K (`/users?q=…`), a reload
 * and «Назад» keep them (Stripe, Linear and Vercel do the same).
 *
 * The semantics are nuqs' (MIT, 47ng/nuqs — `useQueryState` with
 * `parseAsStringLiteral(...).withDefault(...)`, `clearOnDefault`, `history:
 * 'replace'`, shallow): one parameter per filter, a value outside the
 * allowed list reads as the default, the default is removed from the
 * address, and a change replaces the current history entry with the native
 * `history.replaceState` (Next.js app router syncs it with its own router:
 * no navigation, no refetch, no Suspense boundary). The repo has no nuqs;
 * the same mechanism already keeps the sort order (lib/table-sort.ts), so
 * both share one store here instead of a new dependency.
 */
const EVENT = 'lawbid:url-state';

/** Re-render on «Назад» / «Вперёд» and on every change made through this module. */
export function subscribeSearch(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
}
const clientSearch = () => window.location.search;
const serverSearch = () => '';

/** The current query string, kept in sync (empty on the server). */
export function useSearch(): string {
  return useSyncExternalStore(subscribeSearch, clientSearch, serverSearch);
}

/** `search` with each key set (null / '' removes it), as `?a=1&b=2` or ''. */
export function withParams(search: string, patch: Record<string, string | null>): string {
  const params = new URLSearchParams(search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Writes the patch into the current history entry (no new entry, no navigation). */
export function replaceSearch(patch: Record<string, string | null>): void {
  const qs = withParams(window.location.search, patch);
  if (qs === window.location.search || (qs === '' && window.location.search === '?')) return;
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs}${window.location.hash}`);
  } catch {
    // Safari limits replaceState to 100 calls in 10 s: the filter still
    // works on the page, only the address misses this one change.
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** A value read from the address: missing or not allowed = the default. */
export function parseParam<T extends string>(raw: string | null, fallback: T, allowed?: readonly T[]): T {
  if (raw === null) return fallback;
  if (allowed && !allowed.includes(raw as T)) return fallback;
  return raw as T;
}

/**
 * One filter in the address under `key`. `allowed` (a module-level
 * constant) limits it to known values; the default is never written.
 */
export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const raw = new URLSearchParams(useSearch()).get(key);
  const value = parseParam(raw, fallback, allowed);
  const set = useCallback((v: T) => replaceSearch({ [key]: v === fallback ? null : v }), [key, fallback]);
  return [value, set];
}

/** An on/off filter: `?key=1` when on, nothing when off. */
export function useUrlFlag(key: string): [boolean, (v: boolean) => void] {
  const [v, set] = useUrlState<'' | '1'>(key, '', ['', '1']);
  const setFlag = useCallback((on: boolean) => set(on ? '1' : ''), [set]);
  return [v === '1', setFlag];
}

/**
 * A search box: the text typed stays local (no address change per key
 * press — Safari's replaceState limit, nuqs throttles the same way), the
 * trimmed text reaches the address `delay` ms after typing stops, and the
 * query reads the address value. A change from outside (⌘K, «Назад»)
 * replaces the typed text.
 */
export function useUrlSearchText(key: string, delay = 300): { text: string; setText: (v: string) => void; value: string } {
  const [value, setValue] = useUrlState<string>(key, '');
  const [text, setText] = useState(value);
  const written = useRef(value);
  useEffect(() => {
    if (value !== written.current) {
      written.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    const next = text.trim();
    if (next === written.current) return;
    const t = window.setTimeout(() => {
      written.current = next;
      setValue(next);
    }, delay);
    return () => window.clearTimeout(t);
  }, [text, delay, setValue]);
  return { text, setText, value };
}

/**
 * A box applied with Enter (or on blur): the draft is local, `apply` writes
 * the address, the query reads `value`. A change from outside («Назад», a
 * link) replaces the draft.
 */
export function useUrlDraft(key: string): { draft: string; setDraft: (v: string) => void; value: string; apply: (v: string) => void } {
  const [value, setValue] = useUrlState<string>(key, '');
  const [draft, setDraft] = useState(value);
  const seen = useRef(value);
  useEffect(() => {
    if (value !== seen.current) {
      seen.current = value;
      setDraft(value);
    }
  }, [value]);
  const apply = useCallback(
    (v: string) => {
      seen.current = v;
      setValue(v);
    },
    [setValue],
  );
  return { draft, setDraft, value, apply };
}
