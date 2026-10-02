'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { CONTENT_STATUS, REPORT_REASON, TARGET_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type QStatus = 'open' | 'actioned' | 'dismissed';
type TType =
  | ''
  | 'post'
  | 'comment'
  | 'message'
  | 'user'
  | 'case'
  | 'review'
  | 'client_review';

/** docs/06 §3.2: reports grouped by object, oldest first. */
export default function ModerationQueuePage() {
  const [draft, setDraft] = useState({ status: 'open' as QStatus, targetType: '' as TType });
  const [filters, setFilters] = useState(draft);
  const q = useInfiniteQuery({
    queryKey: ['moderation-queue', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/moderation/queue', {
          params: {
            query: {
              status: filters.status,
              targetType: filters.targetType || undefined,
              cursor: pageParam,
              limit: 30,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader title="Модерация" subtitle="Жалобы, сгруппированные по объекту; старые сверху." />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        <div className="w-44 space-y-1">
          <Label htmlFor="st">Статус жалоб</Label>
          <Select id="st" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as QStatus })}>
            <option value="open">открытые</option>
            <option value="actioned">решённые</option>
            <option value="dismissed">отклонённые</option>
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <Label htmlFor="tt">Объект</Label>
          <Select id="tt" value={draft.targetType} onChange={(e) => setDraft({ ...draft, targetType: e.target.value as TType })}>
            <option value="">любой</option>
            {Object.entries(TARGET_TYPE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Показать</Button>
      </form>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Объект</Th>
            <Th>Жалоб</Th>
            <Th>Причины</Th>
            <Th>Автор</Th>
            <Th>Статус объекта</Th>
            <Th>Первая жалоба</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.targetType}:${r.targetId}`} className="hover:bg-surface-2">
              <Td className="max-w-md">
                <Link href={`/moderation/${r.targetType}/${r.targetId}`} className="font-medium text-navy hover:underline">
                  {TARGET_TYPE[r.targetType] ?? r.targetType}
                </Link>
                {r.excerpt ? <div className="line-clamp-2 text-xs text-muted">{r.excerpt}</div> : null}
                <div className="font-mono text-[10px] text-muted">{r.targetId}</div>
              </Td>
              <Td>
                <Badge tone={r.reporters >= 3 ? 'danger' : 'neutral'}>
                  {r.reports}
                  {r.reporters !== r.reports ? ` (${r.reporters} чел.)` : ''}
                </Badge>
              </Td>
              <Td className="text-xs">{r.reasons.map((x) => REPORT_REASON[x] ?? x).join(', ')}</Td>
              <Td className="text-xs">
                {r.author ? (
                  <>
                    <Link href={`/users/${r.author.id}`} className="text-navy underline">
                      {[r.author.firstName, r.author.lastName].filter(Boolean).join(' ') || r.author.username || r.author.id.slice(0, 8)}
                    </Link>
                    {r.author.warnings ? <div className="text-muted">предупреждений: {r.author.warnings}</div> : null}
                  </>
                ) : '—'}
              </Td>
              <Td>
                {r.targetStatus ? (
                  <Badge tone={r.targetStatus === 'hidden' || r.targetStatus === 'removed' || r.targetStatus === 'suspended' ? 'gold' : 'neutral'}>
                    {CONTENT_STATUS[r.targetStatus] ?? r.targetStatus}
                  </Badge>
                ) : (
                  <Badge tone="danger">не найден</Badge>
                )}
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(r.firstReportedAt)}</Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                Очередь пуста
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      {q.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      ) : null}
    </>
  );
}
