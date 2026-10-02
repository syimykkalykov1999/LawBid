'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { CsvButton } from '@/components/csv-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

const STATUS: Record<string, string> = {
  active: 'активна',
  accepted: 'принята',
  rejected_by_client: 'отклонена клиентом',
  rejected_auto: 'закрыта автоматически',
  withdrawn: 'отозвана',
  failed_negotiation: 'не договорились',
};
const FEE: Record<string, string> = {
  fixed: 'фикс',
  hourly: 'в час',
  free_consultation: 'бесплатная консультация',
};
const usd = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

/** Owner 2026-09-30: every bid with its case, attorney, amount and status. */
export default function BidsPage() {
  const [text, setText] = useState('');
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
      <PageHeader title="Ставки" subtitle="Все ставки адвокатов: сумма, раунды переговоров, статус." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-80 space-y-1">
          <Label htmlFor="bq">Кейс</Label>
          <Input id="bq" value={text} onChange={(e) => setText(e.target.value)} placeholder="Название кейса" />
        </div>
        <div className="w-56 space-y-1">
          <Label htmlFor="bs">Статус</Label>
          <Select id="bs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">все</option>
            {Object.entries(STATUS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <CsvButton entity="bids" />
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
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-surface-2">
              <Td className="max-w-sm">
                <Link href={`/cases/${b.caseId}`} className="text-navy underline">
                  {b.caseTitle}
                </Link>
                {b.outsidePractice ? <div className="text-xs text-gold-600">вне практики адвоката</div> : null}
              </Td>
              <Td className="text-xs">{b.attorneyName}</Td>
              <Td className="text-sm">
                {b.feeType === 'free_consultation' ? '—' : usd(b.amountCents)}
                <div className="text-xs text-muted">{FEE[b.feeType] ?? b.feeType}</div>
              </Td>
              <Td>{b.rounds}</Td>
              <Td>
                <Badge tone={b.status === 'accepted' ? 'success' : b.status === 'active' ? 'gold' : 'neutral'}>
                  {STATUS[b.status] ?? b.status}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(b.createdAt)}</Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                Ставок нет
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
