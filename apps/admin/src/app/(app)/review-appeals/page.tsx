'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

type Status = 'pending' | 'accepted' | 'rejected' | 'auto_removed';

const STATUS_LABEL: Record<Status, string> = {
  pending: 'ждут решения',
  accepted: 'приняты (отзыв удалён)',
  rejected: 'отклонены (отзыв оставлен)',
  auto_removed: 'удалены автоматически (30 дней)',
};
const STATUS_TAB: Record<Status, string> = {
  pending: 'Ждут решения',
  accepted: 'Приняты',
  rejected: 'Отклонены',
  auto_removed: 'Удалены автоматически',
};

/**
 * Owner 2026-09-30: appeals of clients against reviews about them.
 * "Принять" removes the reviews, "Отказать" keeps them — one by one or all
 * selected at once. Appeals nobody decides are removed after 30 days.
 */
export default function ReviewAppealsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
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
      const n = input.ids.length;
      const ok = await confirm(
        input.decision === 'accept'
          ? {
              title: n > 1 ? `Принять ${n} обжалований?` : 'Принять обжалование?',
              description: 'Отзывы будут удалены, клиент получит уведомление.',
              confirm: 'Принять и удалить',
              danger: true,
            }
          : {
              title: n > 1 ? `Отказать по ${n} обжалованиям?` : 'Отказать в обжаловании?',
              description: 'Отзывы останутся опубликованными.',
              confirm: 'Отказать',
            },
      );
      if (!ok) return null;
      const r = await api.POST('/admin/review-appeals/decide', {
        body: { ...input, note: note.trim() || undefined },
      });
      if (r.error) throw r.error;
      return { decided: r.data!.data.decided, decision: input.decision };
    },
    onSuccess: (x) => {
      if (!x) return;
      toast.success(x.decision === 'accept' ? `Принято: ${x.decided}` : `Отказано: ${x.decided}`);
      setSelected(new Set());
      setNote('');
      void qc.invalidateQueries({ queryKey: ['review-appeals'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e),
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
      {dialog}
      <PageHeader
        eyebrow="Модерация"
        title="Обжалования отзывов"
        subtitle="Клиенты просят удалить отзывы о себе. Принять — отзыв удаляется, отказать — остаётся. Без решения 30 дней — удаляется сам."
      />
      <Tabs<Status>
        className="mb-4"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setSelected(new Set());
        }}
        items={(Object.keys(STATUS_TAB) as Status[]).map((v) => ({ value: v, label: STATUS_TAB[v] }))}
      />
      {pending ? (
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
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
      </div>
      ) : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
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
          {q.isPending ? <TableEmpty colSpan={pending ? 8 : 6} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i}>
              {pending ? (
                <Td>
                  <input type="checkbox" aria-label="Выбрать" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </Td>
              ) : null}
              <Td className="max-w-sm">
                <div className="text-gold-600">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                {r.body ? <div className="line-clamp-3 text-xs">{r.body}</div> : <div className="text-xs text-muted">без текста</div>}
              </Td>
              <Td className="text-xs">
                {r.authorName}
                <div className="text-muted">{r.authorRole === 'client' ? 'клиент' : 'адвокат'}</div>
              </Td>
              <Td className="text-xs">
                <Link href={`/users/${r.clientId}`} className="text-gold-600 hover:underline">
                  {r.clientName}
                </Link>
              </Td>
              <Td className="max-w-sm text-xs">{r.reason}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.createdAt)}</Td>
              <Td className="whitespace-nowrap text-xs">
                {pending ? formatDateTime(r.autoRemoveAt) : <Badge tone={r.status === 'rejected' ? 'neutral' : 'gold'} dot>{STATUS_LABEL[r.status as Status]}</Badge>}
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
            </MotionRow>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={pending ? 8 : 6}>
              {pending ? 'Новых обжалований нет.' : `Нет обжалований со статусом «${STATUS_LABEL[status]}».`}
            </TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
