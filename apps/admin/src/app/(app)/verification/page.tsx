'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorText } from '@/lib/api/client';
import { REQUEST_STATUS, StatusPill } from '@/lib/labels';
import { formatDateTime, formatDuration } from '@/lib/utils';

type QueueStatus = '' | 'submitted' | 'needs_more_info' | 'in_review';

/** docs/06 §2.3 item 2 — the verifier queue over the file-03 API. */
export default function VerificationQueuePage() {
  const router = useRouter();
  const [status, setStatus] = useState<QueueStatus>('');
  const [stateText, setStateText] = useState('');
  const stateCode = useDebounced(stateText.trim().toUpperCase(), 300);
  const filters = { status, stateCode };
  const q = useInfiniteQuery({
    queryKey: ['verification-queue', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/verification/requests', {
          params: {
            query: {
              status: filters.status || undefined,
              stateCode: filters.stateCode.length === 2 ? filters.stateCode : undefined,
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
      <PageHeader eyebrow="Люди" title="Верификация" subtitle="Очередь заявок адвокатов, старые сверху." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<QueueStatus>
          value={status}
          onChange={setStatus}
          items={[
            { value: '', label: 'Все ожидающие' },
            { value: 'submitted', label: REQUEST_STATUS.submitted },
            { value: 'in_review', label: REQUEST_STATUS.in_review },
            { value: 'needs_more_info', label: REQUEST_STATUS.needs_more_info },
          ]}
        />
        <Input
          aria-label="Штат"
          className="w-28 uppercase"
          maxLength={2}
          placeholder="Штат: NY"
          value={stateText}
          onChange={(e) => setStateText(e.target.value)}
        />
      </div>
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
          {q.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>Очередь пуста — новых заявок нет.</TableEmpty>
          ) : (
            rows.map((r, i) => (
              <MotionRow key={r.id} i={i} className="cursor-pointer" onClick={() => router.push(`/verification/${r.id}`)}>
                <Td>
                  <Link
                    href={`/verification/${r.id}`}
                    className="font-medium text-heading hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[r.attorney.firstName, r.attorney.lastName].filter(Boolean).join(' ') || `@${r.attorney.username}`}
                  </Link>
                  <div className="text-xs text-faint">
                    @{r.attorney.username}
                    {r.adminNote ? ` · ${r.adminNote}` : ''}
                  </div>
                </Td>
                <Td>{r.stateCodes.join(', ')}</Td>
                <Td>
                  <StatusPill map={REQUEST_STATUS} value={r.status} />
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(r.submittedAt)}</Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {r.submittedAt ? formatDuration(Math.floor((now - new Date(r.submittedAt).getTime()) / 1000)) : '—'}
                </Td>
                <Td className="font-mono text-xs text-muted">{r.reviewerId ? r.reviewerId.slice(0, 8) : '—'}</Td>
              </MotionRow>
            ))
          )}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
