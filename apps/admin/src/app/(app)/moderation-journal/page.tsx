'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/card';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { MOD_ACTION, TARGET_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

const APPEAL: Record<string, string> = {
  pending: 'обжалование ждёт',
  accepted: 'обжалование принято',
  rejected: 'обжалование отклонено',
};

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
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
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
            <Th>Когда</Th>
            <Th>Действие</Th>
            <Th>Объект</Th>
            <Th>Причина</Th>
            <Th>Модератор</Th>
            <Th>Обжалование</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={6} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i}>
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
          ))}
          {!q.isPending && rows.length === 0 ? <TableEmpty colSpan={6}>Решений пока нет.</TableEmpty> : null}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
