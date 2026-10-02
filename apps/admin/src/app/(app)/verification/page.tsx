'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { REQUEST_STATUS } from '@/lib/labels';
import { formatDateTime, formatDuration } from '@/lib/utils';

type QueueStatus = '' | 'submitted' | 'needs_more_info' | 'in_review';

/** docs/06 §2.3 item 2 — the verifier queue over the file-03 API. */
export default function VerificationQueuePage() {
  const [draft, setDraft] = useState({ status: '' as QueueStatus, stateCode: '' });
  const [filters, setFilters] = useState(draft);
  const q = useInfiniteQuery({
    queryKey: ['verification-queue', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/verification/requests', {
          params: {
            query: {
              status: filters.status || undefined,
              stateCode: filters.stateCode.trim().toUpperCase() || undefined,
              cursor: pageParam,
              limit: 50,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const now = Date.now();

  return (
    <>
      <PageHeader title="Верификация" subtitle="Очередь заявок адвокатов, старые сверху." />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        <div className="w-52 space-y-1">
          <Label htmlFor="st">Статус</Label>
          <Select id="st" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as QueueStatus })}>
            <option value="">поданные и ожидающие</option>
            <option value="submitted">подана</option>
            <option value="needs_more_info">нужна информация</option>
            <option value="in_review">в работе</option>
          </Select>
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="state">Штат</Label>
          <Input id="state" maxLength={2} placeholder="NY" value={draft.stateCode} onChange={(e) => setDraft({ ...draft, stateCode: e.target.value })} />
        </div>
        <Button type="submit">Показать</Button>
      </form>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Адвокат</Th>
            <Th>Штаты</Th>
            <Th>Статус</Th>
            <Th>Подана</Th>
            <Th>Ожидает</Th>
            <Th>Проверяющий</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-2">
              <Td>
                <Link href={`/verification/${r.id}`} className="font-medium text-navy hover:underline">
                  {[r.attorney.firstName, r.attorney.lastName].filter(Boolean).join(' ') || `@${r.attorney.username}`}
                </Link>
                <div className="text-xs text-muted">@{r.attorney.username}{r.adminNote ? ` · ${r.adminNote}` : ''}</div>
              </Td>
              <Td>{r.stateCodes.join(', ')}</Td>
              <Td>
                <Badge tone={r.status === 'in_review' ? 'gold' : 'neutral'}>{REQUEST_STATUS[r.status] ?? r.status}</Badge>
              </Td>
              <Td className="whitespace-nowrap">{formatDateTime(r.submittedAt)}</Td>
              <Td className="whitespace-nowrap">
                {r.submittedAt ? formatDuration(Math.floor((now - new Date(r.submittedAt).getTime()) / 1000)) : '—'}
              </Td>
              <Td className="font-mono text-xs">{r.reviewerId ? r.reviewerId.slice(0, 8) : '—'}</Td>
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
