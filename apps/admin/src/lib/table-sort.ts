'use client';

import { useCallback, useMemo } from 'react';
import { replaceSearch, useSearch } from './url-state';

/**
 * Owner 2026-11-12 (row 57): click-to-sort column headers in the admin lists.
 *
 * The admin list endpoints take no `sort` / `order` parameter (only
 * /admin/document-templates and /admin/staff/people do), so the rows already
 * loaded on the page are sorted here, in the browser. Nothing is sorted
 * until a header is clicked: the default order stays the server's.
 *
 * The choice lives in the address (`?sort=<key>.<asc|desc>`, a page with
 * several tables gives each its own parameter), so a reload, «Назад» and a
 * shared link keep it. The address is changed with the native
 * `history.replaceState`, which Next.js (app router) supports and syncs with
 * its own router — no navigation, no refetch, no Suspense boundary needed.
 * Three clicks on one header: ascending → descending → back to the default.
 */
export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K | null;
  dir: SortDir;
}

const NONE = { key: null, dir: 'asc' } as const;

/** `"submitted.desc"` → `{ key: 'submitted', dir: 'desc' }`; anything unknown = the default order. */
export function parseSort<K extends string>(raw: string | null | undefined, keys: readonly K[]): SortState<K> {
  if (!raw) return NONE;
  const dot = raw.lastIndexOf('.');
  const key = (dot < 0 ? raw : raw.slice(0, dot)) as K;
  const dir = dot < 0 ? 'asc' : raw.slice(dot + 1);
  if (!keys.includes(key) || (dir !== 'asc' && dir !== 'desc')) return NONE;
  return { key, dir };
}

/** The next state after a click on `key`: asc → desc → default; another column starts at asc. */
export function nextSort<K extends string>(cur: SortState<K>, key: K): SortState<K> {
  if (cur.key !== key) return { key, dir: 'asc' };
  return cur.dir === 'asc' ? { key, dir: 'desc' } : NONE;
}

/** The query string with `param` set to the state (or removed for the default order). */
export function withSort<K extends string>(search: string, param: string, s: SortState<K>): string {
  const params = new URLSearchParams(search);
  if (s.key) params.set(param, `${s.key}.${s.dir}`);
  else params.delete(param);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/** Compares two cell values: numbers, dates (ISO strings), booleans and text; empty last. */
export function compareValues(a: unknown, b: unknown): number {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return collator.compare(String(a), String(b));
}

/**
 * The rows in the chosen order (a stable sort: equal cells keep the
 * server's order). `values` maps each sortable column to the cell value.
 * Empty cells stay at the bottom in both directions.
 */
export function sortRows<T, K extends string>(rows: readonly T[], s: SortState<K>, values: Record<K, (row: T) => unknown>): T[] {
  if (!s.key) return rows as T[];
  const get = values[s.key];
  const sign = s.dir === 'asc' ? 1 : -1;
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((x, y) => {
      if (empty(x.v) || empty(y.v)) return compareValues(x.v, y.v) || x.i - y.i;
      return sign * compareValues(x.v, y.v) || x.i - y.i;
    })
    .map((x) => x.row);
}

/** What a sortable header needs: its direction (null = not sorted by it) and the click. */
export interface SortHeaderProps {
  sorted: SortDir | null;
  onSort: () => void;
}

/**
 * The page's sort state, kept in the address under `param` (default `sort`).
 * `keys` must be a constant (module-level) list of the sortable columns.
 */
export function useTableSort<K extends string>(keys: readonly K[], param = 'sort') {
  // One store with the list filters (lib/url-state.ts).
  const search = useSearch();
  const raw = new URLSearchParams(search).get(param);
  const sort = useMemo(() => parseSort(raw, keys), [raw, keys]);
  const toggle = useCallback(
    (key: K) => {
      const cur = parseSort(new URLSearchParams(window.location.search).get(param), keys);
      const next = nextSort(cur, key);
      replaceSearch({ [param]: next.key ? `${next.key}.${next.dir}` : null });
    },
    [keys, param],
  );
  const header = useCallback((key: K): SortHeaderProps => ({ sorted: sort.key === key ? sort.dir : null, onSort: () => toggle(key) }), [sort, toggle]);
  return { sort, toggle, header };
}
