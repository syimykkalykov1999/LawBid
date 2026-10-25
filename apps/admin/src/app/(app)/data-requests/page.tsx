'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { DATA_REQUEST_STATUS, DATA_REQUEST_TYPE, label, StatusPill } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

const TYPES = ['subpoena', 'court_order', 'search_warrant', 'preservation', 'emergency', 'civil', 'other'] as const;

const EMPTY = {
  requestType: 'subpoena' as (typeof TYPES)[number],
  legalBasis: '',
  country: '',
  dueAt: '',
  doNotNotify: false,
  nondisclosureUntil: '',
  referenceNumber: '',
  agency: '',
  receivedAt: '',
  scope: '',
  notes: '',
};

/** docs/06 §2.3 item 11 / §5.4: registry of subpoenas and court orders. */
export default function DataRequestsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
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
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
          ...(form.legalBasis.trim() ? { legalBasis: form.legalBasis.trim() } : {}),
          ...(form.country.trim().length === 2 ? { country: form.country.trim().toUpperCase() } : {}),
          ...(form.dueAt ? { dueAt: new Date(form.dueAt).toISOString() } : {}),
          ...(form.doNotNotify ? { doNotNotify: true } : {}),
          ...(form.doNotNotify && form.nondisclosureUntil ? { nondisclosureUntil: new Date(form.nondisclosureUntil).toISOString() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success('Запрос зарегистрирован');
      setForm(EMPTY);
      void qc.invalidateQueries({ queryKey: ['data-requests'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Запросы госорганов"
        subtitle="Повестки и решения суда: регистрация, пакет данных строго в объёме запроса, каждая выгрузка записывается в журнал доступа."
        actions={
          <Link href="/data-requests/transparency" className="text-sm font-medium text-heading hover:underline">
            Отчёт прозрачности по годам
          </Link>
        }
      />
      <form
        className="mb-6 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="rt">Тип</Label>
          <Select id="rt" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value as typeof form.requestType })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {DATA_REQUEST_TYPE[t]}
              </option>
            ))}
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
        <div className="space-y-1">
          <Label htmlFor="basis">На каком законе (необязательно)</Label>
          <Input id="basis" maxLength={300} placeholder="например, 18 U.S.C. 2703(d)" value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cty">Страна органа (2 буквы)</Label>
          <Input id="cty" maxLength={2} placeholder="US" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="due">Срок ответа</Label>
          <Input id="due" type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.doNotNotify} onChange={(e) => setForm({ ...form, doNotNotify: e.target.checked })} />
            Запрет рассказывать пользователю (gag order)
          </label>
          {form.doNotNotify ? (
            <Input aria-label="Запрет действует до" type="datetime-local" value={form.nondisclosureUntil} onChange={(e) => setForm({ ...form, nondisclosureUntil: e.target.value })} />
          ) : null}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="scope">Объём запроса</Label>
          <Textarea id="scope" required rows={3} maxLength={2000} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="notes">Заметки (необязательно)</Label>
          <Textarea
            id="notes"
            rows={3}
            maxLength={2000}
            placeholder="Как получен, контакт в органе, сроки"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="flex items-end sm:col-span-2 xl:col-span-4 xl:justify-end">
          <Button type="submit" loading={create.isPending} className="w-full xl:w-auto">
            Зарегистрировать
          </Button>
        </div>
      </form>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Номер</Th>
            <Th>Тип</Th>
            <Th>Орган</Th>
            <Th>Получен</Th>
            <Th>Срок</Th>
            <Th>Статус</Th>
            <Th>Выгрузок</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={7} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i} className="cursor-pointer" onClick={() => router.push(`/data-requests/${r.id}`)}>
              <Td>
                <Link
                  href={`/data-requests/${r.id}`}
                  className="font-medium text-heading hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.referenceNumber}
                </Link>
                <div className="line-clamp-1 text-xs text-muted">{r.scope}</div>
              </Td>
              <Td>{label(DATA_REQUEST_TYPE, r.requestType)}</Td>
              <Td className="text-xs">{r.agency}</Td>
              <Td className="whitespace-nowrap text-muted">{formatDateTime(r.receivedAt)}</Td>
              <Td className="whitespace-nowrap text-muted">
                {r.dueAt ? formatDateTime(r.dueAt) : '—'}
                {r.doNotNotify ? <div className="text-xs text-danger">не сообщать</div> : null}
              </Td>
              <Td>
                <StatusPill map={DATA_REQUEST_STATUS} value={r.status} />
              </Td>
              <Td className="tabular-nums">{r.accessCount}</Td>
            </MotionRow>
          ))}
          {!q.isPending && rows.length === 0 ? <TableEmpty colSpan={7}>Запросов пока нет</TableEmpty> : null}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
