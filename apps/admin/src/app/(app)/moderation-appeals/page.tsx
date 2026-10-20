'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
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
import { MOD_ACTION, TARGET_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Status = 'pending' | 'accepted' | 'rejected';

const STATUS_TAB: Record<Status, string> = {
  pending: 'Ждут решения',
  accepted: 'Приняты (контент возвращён)',
  rejected: 'Отклонены (решение в силе)',
};

/**
 * Owner 2026-10-20: authors of hidden / removed posts, comments and
 * messages ask for a second look. «Вернуть» publishes the object again
 * (an audited «restore»), «Оставить» keeps the decision; the author gets
 * the moderator's words either way.
 */
export default function ModerationAppealsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<Status>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const q = useInfiniteQuery({
    queryKey: ['moderation-appeals', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/moderation/appeals', {
          params: { query: { status, cursor: pageParam, limit: 30 } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const pending = status === 'pending';

  const decide = useMutation({
    mutationFn: async (input: { id: string; accept: boolean }) => {
      const note = (notes[input.id] ?? '').trim();
      if (!note) throw new Error('Напишите комментарий: автор его увидит.');
      const r = await api.POST('/admin/moderation/appeals/{id}/decision', {
        params: { path: { id: input.id } },
        body: { accept: input.accept, note },
      });
      if (r.error) throw r.error;
      return input.accept;
    },
    onSuccess: (accepted) => {
      toast.success(accepted ? 'Контент возвращён, автор уведомлён' : 'Решение оставлено, автор уведомлён');
      void qc.invalidateQueries({ queryKey: ['moderation-appeals'] });
      void qc.invalidateQueries({ queryKey: ['moderation-journal'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Обжалования решений"
        subtitle="Автор просит ещё раз посмотреть скрытый или удалённый пост, комментарий или сообщение. Комментарий к решению обязателен: его увидит автор."
      />
      <Tabs<Status>
        className="mb-4"
        value={status}
        onChange={setStatus}
        items={(Object.keys(STATUS_TAB) as Status[]).map((v) => ({ value: v, label: STATUS_TAB[v] }))}
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Объект</Th>
            <Th>Решение модератора</Th>
            <Th>Что пишет автор</Th>
            <Th>Подано</Th>
            <Th>{pending ? 'Решение' : 'Итог'}</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={5} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i}>
              <Td className="max-w-sm">
                <Link
                  href={`/moderation/${r.targetType}/${r.targetId}`}
                  className="font-medium text-heading hover:underline"
                >
                  {TARGET_TYPE[r.targetType] ?? r.targetType}
                </Link>
                {r.excerpt ? <div className="line-clamp-3 text-xs text-muted">{r.excerpt}</div> : null}
                <div className="text-xs text-faint">
                  {r.appellantName ?? 'автор'} · сейчас: {r.targetStatus ?? '—'}
                </div>
              </Td>
              <Td className="max-w-xs text-xs">
                <Badge tone="neutral" dot>
                  {MOD_ACTION[r.action] ?? r.action}
                </Badge>
                <div className="mt-1">{r.actionReason ?? '—'}</div>
              </Td>
              <Td className="max-w-sm text-xs">{r.message}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.createdAt)}</Td>
              <Td className="min-w-72">
                {pending ? (
                  <div className="space-y-2">
                    <Label htmlFor={`note-${r.id}`} className="sr-only">
                      Комментарий автору
                    </Label>
                    <Input
                      id={`note-${r.id}`}
                      placeholder="Комментарий автору"
                      maxLength={500}
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, accept: true })}>
                        Вернуть
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: r.id, accept: false })}
                      >
                        Оставить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs">
                    <div className="text-muted">{r.decidedAt ? formatDateTime(r.decidedAt) : ''}</div>
                    {r.decisionNote}
                  </div>
                )}
              </Td>
            </MotionRow>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={5}>{pending ? 'Новых обжалований нет.' : 'Здесь пока пусто.'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <MoreButton show={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
