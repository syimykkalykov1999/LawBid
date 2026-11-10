import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * SPEED_MATRIX 2026-11-09 (main matrix, «Мгновенное обновление экрана»,
 * admin ❌ → ✅): the screen changes the moment the admin acts, the server
 * confirms afterwards. The pattern is TanStack Query's own «Optimistic
 * Updates via the cache» (tanstack.com/query/v5/docs/framework/react/guides/
 * optimistic-updates, MIT): `onMutate` cancels in-flight reads of the
 * key, snapshots the cached value, writes the expected result;
 * `onError` puts the snapshot back; `onSettled` re-reads from the server
 * so the cache ends exactly as the server has it. Spread the result into
 * `useMutation({...})` and keep your own `onSuccess` / `onError` beside
 * it (they run after these).
 */
export function optimistic<TData, TVars, TContext extends { previous?: TData } = { previous?: TData }>(
  qc: QueryClient,
  queryKey: QueryKey,
  apply: (current: TData | undefined, vars: TVars) => TData | undefined,
  hooks: {
    onError?: (error: unknown, vars: TVars, context: TContext | undefined) => void;
    onSettled?: () => void;
  } = {},
) {
  return {
    onMutate: async (vars: TVars): Promise<TContext> => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<TData>(queryKey);
      const next = apply(previous, vars);
      if (next !== undefined) qc.setQueryData<TData>(queryKey, next);
      return { previous } as TContext;
    },
    onError: (error: unknown, vars: TVars, context: TContext | undefined) => {
      if (context && 'previous' in context) qc.setQueryData<TData>(queryKey, context.previous);
      hooks.onError?.(error, vars, context);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
      hooks.onSettled?.();
    },
  };
}

/** `apply` for a list: the row whose `id` matches `vars.id` gets `patch(row)`. */
export function patchRow<T extends { key?: string; id?: string }, V extends { key?: string; id?: string }>(
  patch: (row: T, vars: V) => T,
) {
  const same = (row: T, vars: V) => (vars.id !== undefined && row.id === vars.id) || (vars.key !== undefined && row.key === vars.key);
  return (rows: T[] | undefined, vars: V): T[] | undefined => rows?.map((row) => (same(row, vars) ? patch(row, vars) : row));
}
