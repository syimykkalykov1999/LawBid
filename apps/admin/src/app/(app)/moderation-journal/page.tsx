'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { HoverPrefetchLink as Link } from '@/components/ui/hover-prefetch-link';
import { MotionRow } from '@/components/legacy/fade-in';
import { VirtualRows } from '@/components/ui/virtual-rows';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/card';
import { SortTh, Table, TableEmpty, Td } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { MOD_ACTION, TARGET_TYPE } from '@/lib/labels';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime } from '@/lib/utils';

const APPEAL: Record<string, string> = {
  pending: 'обжалование ждёт',
  accepted: 'обжалование принято',
  rejected: 'обжалование отклонено',
};

/** Row 57: click-to-sort headers (the loaded rows; default order = the server's). */
const SORT_KEYS = ['created', 'action', 'target', 'reason', 'admin', 'appeal'] as const;

/** Owner 2026-10-20: every moderation decision, who took it and why. */
export default function ModerationJournalPage() {
  const q = useInfiniteQuery({
    queryKey: ['moderation-journal'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/moderation/journal', {
          params: { query: { cursor: pageParam, limit: 50 } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const { sort, header } = useTableSort(SORT_KEYS);
  const rows = sortRows(q.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    created: (r) => r.createdAt,
    action: (r) => MOD_ACTION[r.action] ?? r.action,
    target: (r) => TARGET_TYPE[r.targetType] ?? r.targetType,
    reason: (r) => r.reason,
    admin: (r) => r.adminName ?? r.adminId,
    appeal: (r) => (r.appealStatus ? APPEAL[r.appealStatus] : null),
  });
  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Журнал решений"
        subtitle="Скрыть, удалить, предупредить, вернуть: кто, когда и почему. Новые сверху."
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <SortTh {...header('created')}>Когда</SortTh>
            <SortTh {...header('action')}>Действие</SortTh>
            <SortTh {...header('target')}>Объект</SortTh>
            <SortTh {...header('reason')}>Причина</SortTh>
            <SortTh {...header('admin')}>Модератор</SortTh>
            <SortTh {...header('appeal')}>Обжалование</SortTh>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
          <VirtualRows rows={rows} colSpan={6}>
            {(r, i, vp) => (
            <MotionRow key={r.id} i={i} {...vp}>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.createdAt)}</Td>
              <Td>
                <Badge tone="neutral" dot>
                  {MOD_ACTION[r.action] ?? r.action}
                </Badge>
              </Td>
              <Td className="text-xs">
                <Link href={`/moderation/${r.targetType}/${r.targetId}`} className="text-gold-600 hover:underline">
                  {TARGET_TYPE[r.targetType] ?? r.targetType}
                </Link>
              </Td>
              <Td className="max-w-md text-xs">{r.reason ?? '—'}</Td>
              <Td className="text-xs">{r.adminName ?? r.adminId}</Td>
              <Td className="text-xs">{r.appealStatus ? APPEAL[r.appealStatus] : '—'}</Td>
            </MotionRow>
            )}
          </VirtualRows>
          {!q.isPending && rows.length === 0 ? <TableEmpty colSpan={6}>Решений пока нет.</TableEmpty> : null}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
