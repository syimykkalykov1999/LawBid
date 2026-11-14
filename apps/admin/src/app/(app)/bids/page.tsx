'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { CsvButton } from '@/components/csv-button';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Input, Label, Select } from '@/components/ui/input';
import { SortTh, Table, TableEmpty, Td } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { BID_STATUS, FEE_TYPE, label, StatusPill, usd } from '@/lib/labels';
import { sortRows, useTableSort } from '@/lib/table-sort';
import { formatDateTime } from '@/lib/utils';
import { useUrlSearchText, useUrlState } from '@/lib/url-state';

/** Row 57: click-to-sort headers (the loaded rows; default order = the server's). */
const SORT_KEYS = ['case', 'attorney', 'amount', 'rounds', 'status', 'created'] as const;

/** Owner 2026-09-30: every bid with its case, attorney, amount and status. */
export default function BidsPage() {
  // Scout 13.11 (row 96): the search and the status live in the address (lib/url-state.ts).
  const { text: input, setText: setInput, value: text } = useUrlSearchText('q');
  const [status, setStatus] = useUrlState<string>('status', '');
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
  const { sort, header } = useTableSort(SORT_KEYS);
  const rows = sortRows(q.data?.pages.flatMap((p) => p.data) ?? [], sort, {
    case: (b) => b.caseTitle,
    attorney: (b) => b.attorneyName,
    amount: (b) => (b.feeType === 'free_consultation' ? null : b.amountCents),
    rounds: (b) => b.rounds,
    status: (b) => BID_STATUS[b.status] ?? b.status,
    created: (b) => b.createdAt,
  });
  return (
    <>
      <PageHeader
        eyebrow="Кейсы"
        title="Ставки"
        subtitle="Все ставки адвокатов: сумма, раунды переговоров, статус."
        actions={<CsvButton entity="bids" />}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1 sm:w-80">
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
            <SortTh {...header('case')}>Кейс</SortTh>
            <SortTh {...header('attorney')}>Адвокат</SortTh>
            <SortTh {...header('amount')}>Сумма</SortTh>
            <SortTh {...header('rounds')}>Раунды</SortTh>
            <SortTh {...header('status')}>Статус</SortTh>
            <SortTh {...header('created')}>Создана</SortTh>
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
