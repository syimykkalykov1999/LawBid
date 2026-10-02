'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';
import { CsvButton } from '@/components/csv-button';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { PLAN } from '@/lib/labels';
import { cn, formatDateTime } from '@/lib/utils';

const DUTIES: [string, string][] = [
  ['calls', 'Звонки'],
  ['chats', 'Чаты'],
  ['files', 'Файлы'],
  ['cases', 'Кейсы'],
  ['bid_drafts', 'Черновики ставок'],
  ['posts', 'Публикации'],
  ['tasks', 'Задачи'],
  ['profile', 'Профиль'],
];

const ACTION_LABEL: Record<string, string> = {
  'chat.message': 'написал(а) в чате',
  'call.accept': 'ответил(а) на звонок',
  'call.start': 'позвонил(а)',
  'task.create': 'поставил(а) задачу',
  'request.post': 'просит опубликовать пост',
  'request.comment': 'просит оставить комментарий',
  'request.case_comment': 'просит прокомментировать кейс',
  'request.profile_edit': 'предлагает правку профиля',
  'bid.draft': 'подготовил(а) черновик ставки',
  'file.upload': 'загрузил(а) файл',
  'admin.remove': 'удалён(а) администрацией',
};

/**
 * OQ-048 (owner 2026-09-30): attorney teams — plan and seats, assistants
 * with their duties, the activity log; an admin can change duties or
 * remove an assistant (access ends at once; the attorney sees why).
 */
export default function TeamsPage() {
  const [input, setInput] = useState('');
  const q = useDebounced(input.trim(), 300);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['admin-teams', q],
    queryFn: async () =>
      (await api.GET('/admin/teams', { params: { query: { q: q || undefined } } })).data!.data,
  });
  return (
    <>
      <PageHeader
        eyebrow="Люди"
        title="Команды адвокатов"
        subtitle="Помощники работают в аккаунте адвоката. Места: месячный план — купленные, годовой — 6."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative w-full max-w-md">
          <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input
            aria-label="Поиск"
            placeholder="Имя адвоката, @username или телефон"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <CsvButton entity="teams" label="Скачать CSV" />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Адвокат</Th>
            <Th>План</Th>
            <Th>Места</Th>
            <Th>Работают</Th>
            <Th>Ждут входа</Th>
            <Th>Запросы</Th>
            <Th>Открытые задачи</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.isPending ? <TableEmpty colSpan={8} loading /> : null}
          {(list.data ?? []).map((t, i) => (
            <MotionRow
              key={t.attorneyId}
              i={i}
              className={cn('cursor-pointer', open === t.attorneyId && 'bg-accent-soft')}
              onClick={() => setOpen(open === t.attorneyId ? null : t.attorneyId)}
            >
              <Td>
                <Link
                  href={`/users/${t.attorneyId}`}
                  className="font-medium text-heading hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t.attorneyName}
                </Link>
                {t.username ? <div className="text-xs text-muted">@{t.username}</div> : null}
              </Td>
              <Td>{t.plan ? PLAN[t.plan] ?? t.plan : '—'}</Td>
              <Td>{t.seats}</Td>
              <Td>{t.active}</Td>
              <Td>{t.invited}</Td>
              <Td>{t.pendingRequests > 0 ? <Badge tone="gold">{t.pendingRequests}</Badge> : 0}</Td>
              <Td>{t.openTasks}</Td>
              <Td>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(open === t.attorneyId ? null : t.attorneyId);
                  }}
                >
                  {open === t.attorneyId ? 'Скрыть' : 'Открыть'}
                </Button>
              </Td>
            </MotionRow>
          ))}
          {!list.isPending && (list.data ?? []).length === 0 ? (
            <TableEmpty colSpan={8}>{q ? 'Ничего не найдено' : 'Команд пока нет'}</TableEmpty>
          ) : null}
        </tbody>
      </Table>
      {open ? <TeamDetail attorneyId={open} /> : null}
    </>
  );
}

function TeamDetail({ attorneyId }: { attorneyId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const team = useQuery({
    queryKey: ['admin-team', attorneyId],
    queryFn: async () =>
      (await api.GET('/admin/teams/{id}', { params: { path: { id: attorneyId } } })).data!.data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-team', attorneyId] });
    void qc.invalidateQueries({ queryKey: ['admin-teams'] });
  };
  const duties = useMutation({
    mutationFn: async (input: { memberId: string; duties: string[] }) => {
      const r = await api.PATCH('/admin/teams/members/{memberId}/duties', {
        params: { path: { memberId: input.memberId } },
        body: { duties: input.duties as never },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Обязанности обновлены');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: async (input: { memberId: string; reason: string }) => {
      const r = await api.POST('/admin/teams/members/{memberId}/remove', {
        params: { path: { memberId: input.memberId } },
        body: { reason: input.reason },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Помощник удалён из команды');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const t = team.data;
  if (team.error) {
    return (
      <div className="mt-6">
        <ErrorNote text={errorText(team.error)} />
        <Button size="sm" variant="outline" onClick={() => void team.refetch()}>
          Повторить
        </Button>
      </div>
    );
  }
  if (!t) {
    return (
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-72 rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  return (
    <FadeIn className="mt-6 grid gap-4 lg:grid-cols-2">
      {dialog}
      <Card>
        <CardHeader>
          <CardTitle>Помощники — {t.attorneyName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {t.members.length === 0 ? <div className="text-sm text-muted">Нет помощников</div> : null}
          {t.members.map((m) => (
            <div key={m.id} className="rounded-[var(--radius-md)] border border-line p-3 transition-colors hover:bg-surface-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-heading">{m.name ?? m.phone}</div>
                  <div className="text-xs text-muted">
                    {m.phone} · {m.approval === 'purchase' ? 'добавлен при покупке' : m.approval === 'attorney_otp' ? 'по коду адвоката' : 'добавлен адвокатом'}
                    {m.joinedAt ? ` · с ${formatDateTime(m.joinedAt)}` : ''}
                  </div>
                </div>
                <Badge tone={m.status === 'active' ? 'success' : m.status === 'removed' ? 'danger' : 'warning'} dot>
                  {m.status === 'active' ? 'работает' : m.status === 'removed' ? 'удалён' : 'ждёт входа'}
                </Badge>
              </div>
              {m.status !== 'removed' ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {DUTIES.map(([code, label]) => (
                      <label key={code} className="flex cursor-pointer items-center gap-1.5 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={m.duties.includes(code)}
                          disabled={duties.isPending}
                          onChange={(e) =>
                            duties.mutate({
                              memberId: m.id,
                              duties: e.target.checked
                                ? [...m.duties, code]
                                : m.duties.filter((d) => d !== code),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={remove.isPending}
                      onClick={async () => {
                        const r = await ask({
                          title: 'Удалить помощника из команды',
                          description: 'Доступ закончится сразу. Адвокат увидит причину в журнале команды.',
                          confirm: 'Удалить',
                          danger: true,
                        });
                        if (r) remove.mutate({ memberId: m.id, reason: r.text });
                      }}
                    >
                      Удалить из команды
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Журнал действий (последние 100)</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[560px] space-y-2 overflow-y-auto">
          {t.activity.length === 0 ? <div className="text-sm text-muted">Пока пусто</div> : null}
          {t.activity.map((a) => (
            <div key={a.id} className="border-b border-line pb-2 text-sm last:border-0">
              <span className="font-medium text-heading">{a.assistantName}</span>{' '}
              {ACTION_LABEL[a.action] ?? a.action}
              {a.summary ? <div className="text-xs text-muted">{a.summary}</div> : null}
              <div className="text-xs text-faint">{formatDateTime(a.createdAt)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </FadeIn>
  );
}
