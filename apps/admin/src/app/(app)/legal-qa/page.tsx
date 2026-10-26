'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MotionRow } from '@/components/legacy/fade-in';
import { MoreButton } from '@/components/legacy/more-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type Status = 'all' | 'published' | 'hidden' | 'removed';
type Action = 'hide' | 'remove' | 'restore';

const STATUS_LABEL: Record<string, string> = { published: 'виден', hidden: 'скрыт', removed: 'удалён' };
const ACTION_LABEL: Record<Action, string> = { hide: 'Скрыть', remove: 'Удалить', restore: 'Вернуть' };

/**
 * Owner 2026-10-20: «Вопрос юристу» in the admin. Find a question, read its
 * answers, hide / remove / restore a question or one answer (with a reason,
 * through the same moderation actions as reports), and unpin the «best
 * answer». Who may ask without a name is a setting («qa.allow_anonymous»
 * in Настройки).
 */
export default function LegalQaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = can(me, 'moderation', 'manage');
  const { ask, dialog } = useReason();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [open, setOpen] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['legal-qa', term, status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/legal-qa/questions', {
          params: { query: { q: term || undefined, status, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const detail = useQuery({
    queryKey: ['legal-qa-question', open],
    enabled: open !== null,
    queryFn: async () => (await api.GET('/admin/legal-qa/questions/{id}', { params: { path: { id: open! } } })).data!.data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['legal-qa'] });
    void qc.invalidateQueries({ queryKey: ['legal-qa-question'] });
  };

  const moderate = useMutation({
    mutationFn: async (v: { type: 'legal_question' | 'legal_answer'; id: string; action: Action }) => {
      const a = await ask({
        title: `${ACTION_LABEL[v.action]}: ${v.type === 'legal_question' ? 'вопрос' : 'ответ'}`,
        description: 'Автор получит уведомление модерации; действие попадёт в журнал решений.',
        label: 'Причина',
        min: 3,
        confirm: ACTION_LABEL[v.action],
        danger: v.action !== 'restore',
      });
      if (!a) return false;
      const r = await api.POST('/admin/moderation/targets/{type}/{id}/actions', {
        params: { path: { type: v.type, id: v.id } },
        body: { action: v.action, reason: a.text },
      });
      if (r.error) throw r.error;
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Готово, действие записано в журнал');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const clearBest = useMutation({
    mutationFn: async (id: string) => {
      const r = await api.POST('/admin/legal-qa/questions/{id}/clear-best', { params: { path: { id } } });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Отметка «лучший ответ» снята');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const q = detail.data;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Модерация"
        title="Вопросы юристу"
        subtitle="Публичные вопросы клиентов и ответы проверенных адвокатов. Можно найти вопрос, прочитать ответы, скрыть или удалить вопрос либо отдельный ответ, снять отметку «лучший ответ». Разрешить анонимные вопросы можно в Настройках («qa.allow_anonymous»)."
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search.trim());
        }}
      >
        <div className="min-w-64 flex-1 space-y-1">
          <Label htmlFor="qa-q">Заголовок или текст</Label>
          <Input id="qa-q" value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="qa-status">Статус</Label>
          <Select id="qa-status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="all">Все</option>
            <option value="published">Видны</option>
            <option value="hidden">Скрыты</option>
            <option value="removed">Удалены</option>
          </Select>
        </div>
        <Button type="submit">Найти</Button>
      </form>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Вопрос</Th>
            <Th>Автор</Th>
            <Th>Ответов</Th>
            <Th>Статус</Th>
            <Th>Создан</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.isPending ? <TableEmpty colSpan={6} loading /> : null}
          {rows.map((r, i) => (
            <MotionRow key={r.id} i={i}>
              <Td className="max-w-md">
                <div className="font-medium">{r.title}</div>
                <div className="line-clamp-2 text-xs text-muted">{r.body}</div>
              </Td>
              <Td className="text-xs">
                {r.author.name}
                {r.isAnonymous ? <span className="text-muted"> · анонимно</span> : null}
              </Td>
              <Td className="text-xs">{r.answerCount}</Td>
              <Td>
                <Badge tone={r.status === 'published' ? 'neutral' : 'gold'} dot>
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.createdAt)}</Td>
              <Td className="whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? 'Скрыть' : 'Открыть'}
                </Button>
              </Td>
            </MotionRow>
          ))}
          {!list.isPending && rows.length === 0 ? (
            <TableEmpty colSpan={6}>{term || status !== 'all' ? 'По этому фильтру ничего нет.' : 'Вопросов пока нет.'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      <MoreButton show={list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />

      {open ? (
        <div className="mt-6 space-y-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
          <ErrorNote text={detail.error ? errorText(detail.error) : null} />
          {q ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-medium">{q.title}</div>
                  <div className="text-xs text-muted">
                    {q.author.name}
                    {q.isAnonymous ? ' · анонимно (в приложении имя скрыто)' : ''}
                    {q.stateCode ? ` · ${q.stateCode}` : ''}
                    {q.practiceArea ? ` · ${q.practiceArea}` : ''}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{q.body}</p>
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    {q.status === 'published' ? (
                      <>
                        <Button size="sm" variant="outline" disabled={moderate.isPending} onClick={() => moderate.mutate({ type: 'legal_question', id: q.id, action: 'hide' })}>
                          Скрыть
                        </Button>
                        <Button size="sm" variant="outline" disabled={moderate.isPending} onClick={() => moderate.mutate({ type: 'legal_question', id: q.id, action: 'remove' })}>
                          Удалить
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" disabled={moderate.isPending} onClick={() => moderate.mutate({ type: 'legal_question', id: q.id, action: 'restore' })}>
                        Вернуть
                      </Button>
                    )}
                    {q.bestAnswerId ? (
                      <Button size="sm" variant="outline" disabled={clearBest.isPending} onClick={() => clearBest.mutate(q.id)}>
                        Снять «лучший ответ»
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Ответ</Th>
                    <Th>Адвокат</Th>
                    <Th>Лайков</Th>
                    <Th>Статус</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {q.answers.length === 0 ? <TableEmpty colSpan={5}>Ответов нет.</TableEmpty> : null}
                  {q.answers.map((a) => (
                    <tr key={a.id}>
                      <Td className="max-w-md whitespace-pre-wrap text-xs">
                        {a.isBest ? <Badge tone="gold" dot>лучший</Badge> : null} {a.body}
                      </Td>
                      <Td className="text-xs">{a.attorney.name}</Td>
                      <Td className="text-xs">{a.likeCount}</Td>
                      <Td className="text-xs">{STATUS_LABEL[a.status] ?? a.status}</Td>
                      <Td className="whitespace-nowrap">
                        {canWrite ? (
                          a.status === 'published' ? (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" disabled={moderate.isPending} onClick={() => moderate.mutate({ type: 'legal_answer', id: a.id, action: 'hide' })}>
                                Скрыть
                              </Button>
                              <Button size="sm" variant="outline" disabled={moderate.isPending} onClick={() => moderate.mutate({ type: 'legal_answer', id: a.id, action: 'remove' })}>
                                Удалить
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" disabled={moderate.isPending} onClick={() => moderate.mutate({ type: 'legal_answer', id: a.id, action: 'restore' })}>
                              Вернуть
                            </Button>
                          )
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : (
            <div className="text-sm text-muted">Загрузка…</div>
          )}
        </div>
      ) : null}
    </>
  );
}
