'use client';

import { useSearch } from '@/lib/url-state';

/**
 * Detective D1-15 (13.11): a click-sorted column (lib/table-sort.ts) orders
 * only the rows already loaded — the admin list endpoints take no `sort`
 * parameter (checked in packages/api-contract/openapi.json: /admin/users,
 * /admin/cases, /admin/audit-log). While more pages are left, the list says
 * so under «Показать ещё» instead of passing a partial order off as the
 * whole one. Any `sort` / `…Sort` address parameter with a value counts.
 */
export function SortScopeHint() {
  const search = useSearch();
  const sorted = [...new URLSearchParams(search).entries()].some(([k, v]) => /sort$/i.test(k) && !!v);
  if (!sorted) return null;
  return (
    <p className="mt-3 text-center text-xs text-faint" data-testid="sort-scope-hint">
      Сортировка по столбцу — только среди загруженных строк. «Показать ещё» догрузит остальные, и порядок обновится.
    </p>
  );
}
