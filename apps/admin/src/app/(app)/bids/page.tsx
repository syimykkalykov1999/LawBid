'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { CsvButton } from '@/components/csv-button';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { BID_STATUS, FEE_TYPE, label, StatusPill, usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** Owner 2026-09-30: every bid with its case, attorney, amount and status. */
export default function BidsPage() {
  const [input, setInput] = useState('');
  const text = useDebounced(input.trim(), 300);
  const [status, setStatus] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['admin-bids', text, status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/bids', {
          params: { query: { q: text || undefined, status: (status || undefined) as never, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <PageHeader
        eyebrow="Кейсы"
        title="Ставки"
        subtitle="Все ставки адвокатов: сумма, раунды переговоров, статус."
        actions={<CsvButton entity="bids" />}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-80 space-y-1">
          <Label htmlFor="bq">Кейс</Label>
          <div className="relative">
            <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input id="bq" className="pl-9" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Название кейса" />
          </div>
        </div>
        <div className="w-56 space-y-1">
          <Label htmlFor="bs">Статус</Label>
          <Select id="bs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">все</option>
            {Object.entries(BID_STATUS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Кейс</Th>
            <Th>Адвокат</Th>
            <Th>Сумма</Th>
            <Th>Раунды</Th>
            <Th>Статус</Th>
            <Th>Создана</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>{text || status ? 'Ничего не найдено' : 'Ставок пока нет'}</TableEmpty>
          ) : (
            rows.map((b, i) => (
              <MotionRow key={b.id} i={i}>
                <Td className="max-w-sm">
                  <Link href={`/cases/${b.caseId}`} className="font-medium text-heading hover:underline">
                    {b.caseTitle}
                  </Link>
                  {b.outsidePractice ? <div className="text-xs text-gold-600">вне практики адвоката</div> : null}
                </Td>
                <Td className="text-xs">{b.attorneyName}</Td>
                <Td className="text-sm tabular-nums">
                  {b.feeType === 'free_consultation' ? '—' : usd(b.amountCents)}
                  <div className="text-xs text-muted">{label(FEE_TYPE, b.feeType)}</div>
                </Td>
                <Td className="tabular-nums">{b.rounds}</Td>
                <Td>
                  <StatusPill map={BID_STATUS} value={b.status} />
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(b.createdAt)}</Td>
              </MotionRow>
            ))
          )}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
