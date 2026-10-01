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
import { formatDateTime } from '@/lib/utils';

type Status = 'pending' | 'accepted' | 'rejected' | 'auto_removed';

const STATUS_LABEL: Record<Status, string> = {
  pending: 'ждут решения',
  accepted: 'приняты (отзыв удалён)',
  rejected: 'отклонены (отзыв оставлен)',
  auto_removed: 'удалены автоматически (30 дней)',
};

/**
 * Owner 2026-09-30: appeals of clients against reviews about them.
 * "Принять" removes the reviews, "Отказать" keeps them — one by one or all
 * selected at once. Appeals nobody decides are removed after 30 days.
 */
export default function ReviewAppealsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['review-appeals', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/review-appeals', {
          params: { query: { status, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const pending = status === 'pending';

  const decide = useMutation({
    mutationFn: async (input: { ids: string[]; decision: 'accept' | 'reject' }) => {
      const r = await api.POST('/admin/review-appeals/decide', {
        body: { ...input, note: note.trim() || undefined },
      });
      if (r.error) throw r.error;
      return r.data!.data.decided;
    },
    onSuccess: () => {
      setSelected(new Set());
      setNote('');
      void qc.invalidateQueries({ queryKey: ['review-appeals'] });
    },
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <PageHeader
        title="Обжалования отзывов"
        subtitle="Клиенты просят удалить отзывы о себе. Принять — отзыв удаляется, отказать — остаётся. Без решения 30 дней — удаляется сам."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
        <div className="w-64 space-y-1">
          <Label htmlFor="st">Статус</Label>
          <Select
            id="st"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setSelected(new Set());
            }}
          >
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        {pending ? (
          <>
            <div className="min-w-64 flex-1 space-y-1">
              <Label htmlFor="note">Комментарий к решению (необязательно)</Label>
              <Input id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button
              disabled={selected.size === 0 || decide.isPending}
              onClick={() => decide.mutate({ ids: [...selected], decision: 'accept' })}
            >
              Принять выбранные ({selected.size})
            </Button>
            <Button
              variant="outline"
              disabled={selected.size === 0 || decide.isPending}
              onClick={() => decide.mutate({ ids: [...selected], decision: 'reject' })}
            >
              Отказать выбранным ({selected.size})
            </Button>
          </>
        ) : null}
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : decide.error ? errorText(decide.error) : null} />
      <Table>
        <thead>
          <tr>
            {pending ? (
              <Th>
                <input
                  type="checkbox"
                  aria-label="Выбрать все"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </Th>
            ) : null}
            <Th>Отзыв</Th>
            <Th>Автор</Th>
            <Th>Клиент</Th>
            <Th>Причина обжалования</Th>
            <Th>Подано</Th>
            <Th>{pending ? 'Удалится автоматически' : 'Статус'}</Th>
            {pending ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              {pending ? (
                <Td>
                  <input type="checkbox" aria-label="Выбрать" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </Td>
              ) : null}
              <Td className="max-w-sm">
                <div className="text-gold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                {r.body ? <div className="line-clamp-3 text-xs">{r.body}</div> : <div className="text-xs text-muted">без текста</div>}
              </Td>
              <Td className="text-xs">
                {r.authorName}
                <div className="text-muted">{r.authorRole === 'client' ? 'клиент' : 'адвокат'}</div>
              </Td>
              <Td className="text-xs">
                <Link href={`/users/${r.clientId}`} className="text-navy underline">
                  {r.clientName}
                </Link>
              </Td>
              <Td className="max-w-sm text-xs">{r.reason}</Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</Td>
              <Td className="whitespace-nowrap text-xs">
                {pending ? formatDateTime(r.autoRemoveAt) : <Badge tone={r.status === 'rejected' ? 'neutral' : 'gold'}>{STATUS_LABEL[r.status as Status]}</Badge>}
              </Td>
              {pending ? (
                <Td className="whitespace-nowrap">
                  <div className="flex gap-2">
                    <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ ids: [r.id], decision: 'accept' })}>
                      Принять
                    </Button>
                    <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ ids: [r.id], decision: 'reject' })}>
                      Отказать
                    </Button>
                  </div>
                </Td>
              ) : null}
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={pending ? 8 : 6} className="py-8 text-center text-muted">
                Обжалований нет
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
