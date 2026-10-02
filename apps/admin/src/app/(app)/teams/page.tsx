'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { CsvButton } from '@/components/csv-button';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

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
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['admin-teams', q],
    queryFn: async () =>
      (await api.GET('/admin/teams', { params: { query: { q: q || undefined } } })).data!.data,
  });
  return (
    <>
      <PageHeader
        title="Команды адвокатов"
        subtitle="Помощники работают в аккаунте адвоката. Места: месячный план — купленные, годовой — 6."
      />
      <div className="mb-4 flex gap-3">
        <Input
          placeholder="Имя адвоката, @username или телефон"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
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
          {(list.data ?? []).map((t) => (
            <tr key={t.attorneyId} className="hover:bg-surface-2">
              <Td>
                <Link href={`/users/${t.attorneyId}`} className="text-navy underline">
                  {t.attorneyName}
                </Link>
                {t.username ? <div className="text-xs text-muted">@{t.username}</div> : null}
              </Td>
              <Td>{t.plan === 'yearly' ? 'Годовой' : t.plan === 'monthly' ? 'Месячный' : '—'}</Td>
              <Td>{t.seats}</Td>
              <Td>{t.active}</Td>
              <Td>{t.invited}</Td>
              <Td>{t.pendingRequests > 0 ? <Badge tone="gold">{t.pendingRequests}</Badge> : 0}</Td>
              <Td>{t.openTasks}</Td>
              <Td>
                <Button size="sm" variant="outline" onClick={() => setOpen(open === t.attorneyId ? null : t.attorneyId)}>
                  {open === t.attorneyId ? 'Скрыть' : 'Открыть'}
                </Button>
              </Td>
            </tr>
          ))}
          {!list.isPending && (list.data ?? []).length === 0 ? (
            <tr>
              <Td colSpan={8} className="py-8 text-center text-muted">
                Команд пока нет
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      {open ? <TeamDetail attorneyId={open} /> : null}
    </>
  );
}

function TeamDetail({ attorneyId }: { attorneyId: string }) {
  const qc = useQueryClient();
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
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (input: { memberId: string; reason: string }) => {
      const r = await api.POST('/admin/teams/members/{memberId}/remove', {
        params: { path: { memberId: input.memberId } },
        body: { reason: input.reason },
      });
      if (r.error) throw r.error;
    },
    onSuccess: refresh,
  });
  const t = team.data;
  if (!t) return <div className="mt-6 text-sm text-muted">Загрузка…</div>;
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {dialog}
      <Card>
        <CardHeader>
          <CardTitle>Помощники — {t.attorneyName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorNote text={duties.error ? errorText(duties.error) : remove.error ? errorText(remove.error) : null} />
          {t.members.length === 0 ? <div className="text-sm text-muted">Нет помощников</div> : null}
          {t.members.map((m) => (
            <div key={m.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{m.name ?? m.phone}</div>
                  <div className="text-xs text-muted">
                    {m.phone} · {m.approval === 'purchase' ? 'добавлен при покупке' : m.approval === 'attorney_otp' ? 'по коду адвоката' : 'добавлен адвокатом'}
                    {m.joinedAt ? ` · с ${formatDateTime(m.joinedAt)}` : ''}
                  </div>
                </div>
                <Badge tone={m.status === 'active' ? 'success' : m.status === 'removed' ? 'danger' : 'gold'}>
                  {m.status === 'active' ? 'работает' : m.status === 'removed' ? 'удалён' : 'ждёт входа'}
                </Badge>
              </div>
              {m.status !== 'removed' ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {DUTIES.map(([code, label]) => (
                      <label key={code} className="flex items-center gap-1 text-xs">
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
              <span className="font-medium">{a.assistantName}</span>{' '}
              {ACTION_LABEL[a.action] ?? a.action}
              {a.summary ? <div className="text-xs text-muted">{a.summary}</div> : null}
              <div className="text-xs text-muted">{formatDateTime(a.createdAt)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
