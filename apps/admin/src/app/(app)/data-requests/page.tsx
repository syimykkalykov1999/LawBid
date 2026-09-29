'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { DATA_REQUEST_STATUS } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

const EMPTY = {
  requestType: 'subpoena' as 'subpoena' | 'court_order',
  referenceNumber: '',
  agency: '',
  receivedAt: '',
  scope: '',
  notes: '',
};

/** docs/06 §2.3 item 11 / §5.4: registry of subpoenas and court orders. */
export default function DataRequestsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['data-requests'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => (await api.GET('/admin/data-requests', { params: { query: { cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const create = useMutation({
    mutationFn: () =>
      api.POST('/admin/data-requests', {
        body: {
          requestType: form.requestType,
          referenceNumber: form.referenceNumber,
          agency: form.agency,
          receivedAt: new Date(form.receivedAt).toISOString(),
          scope: form.scope,
          ...(form.notes ? { notes: form.notes } : {}),
        },
      }),
    onSuccess: () => {
      setForm(EMPTY);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['data-requests'] });
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <>
      <PageHeader
        title="Запросы госорганов"
        subtitle="Subpoena / court order: регистрация, пакет данных строго в объёме запроса, каждая выгрузка — в data_access_log."
      />
      <form
        className="mb-6 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="rt">Тип</Label>
          <Select id="rt" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value as typeof form.requestType })}>
            <option value="subpoena">subpoena</option>
            <option value="court_order">court order</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ref">Номер</Label>
          <Input id="ref" required maxLength={120} value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ag">Орган / суд</Label>
          <Input id="ag" required maxLength={200} value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rcv">Получен</Label>
          <Input id="rcv" type="datetime-local" required value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-2 xl:col-span-3">
          <Label htmlFor="scope">Объём запроса</Label>
          <Input id="scope" required maxLength={2000} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending} className="w-full">
            Зарегистрировать
          </Button>
        </div>
      </form>
      <ErrorNote text={error ?? (q.error ? errorText(q.error) : null)} />
      <Table>
        <thead>
          <tr>
            <Th>Номер</Th>
            <Th>Тип</Th>
            <Th>Орган</Th>
            <Th>Получен</Th>
            <Th>Статус</Th>
            <Th>Выгрузок</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <Td>
                <Link href={`/data-requests/${r.id}`} className="font-medium text-navy hover:underline">
                  {r.referenceNumber}
                </Link>
                <div className="line-clamp-1 text-xs text-muted">{r.scope}</div>
              </Td>
              <Td>{r.requestType}</Td>
              <Td className="text-xs">{r.agency}</Td>
              <Td className="whitespace-nowrap">{formatDateTime(r.receivedAt)}</Td>
              <Td>
                <Badge tone={r.status === 'fulfilled' ? 'success' : r.status === 'rejected' ? 'danger' : r.status === 'in_progress' ? 'gold' : 'neutral'}>
                  {DATA_REQUEST_STATUS[r.status] ?? r.status}
                </Badge>
              </Td>
              <Td>{r.accessCount}</Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted">
                Запросов нет
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
