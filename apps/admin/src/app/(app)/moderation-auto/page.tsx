'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AutoModerationSettingsCard } from '@/components/auto-moderation-settings-card';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { TARGET_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Tab = 'pending' | 'review' | 'reporters' | 'strikes' | 'decided';

const TABS: Record<Tab, string> = {
  pending: 'Апелляции',
  review: 'Приоритетная проверка',
  reporters: 'Жалобщики',
  strikes: 'Страйки',
  decided: 'Решённые апелляции',
};

const KIND: Record<string, string> = {
  content_hide: 'Контент скрыт автоматически',
  account_limit: 'Аккаунт ограничен',
  account_suspend_temp: 'Публикации приостановлены',
  account_suspend: 'Аккаунт заблокирован',
  review_needed: 'Нужна проверка человеком',
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Owner 2026-10-27: moderation without a person in the loop. Here a person
 * sees only what was appealed (and verified attorneys who crossed a
 * threshold), how the automation is doing (actions, appeals, overturned
 * decisions) and every tunable. Approving an appeal restores the account,
 * the content and the strikes.
 */
export default function ModerationAutoPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['mod-auto'] });
  };

  const metrics = useQuery({
    queryKey: ['mod-auto', 'metrics'],
    queryFn: async () => (await api.GET('/admin/moderation/auto-metrics', { params: { query: { days: 14 } } })).data!.data,
  });
  const actions = useQuery({
    queryKey: ['mod-auto', 'actions', tab],
    enabled: tab === 'pending' || tab === 'review' || tab === 'decided',
    queryFn: async () =>
      (
        await api.GET('/admin/moderation/auto-actions', {
          params: { query: { status: tab === 'decided' ? 'accepted' : tab === 'review' ? 'review' : 'pending', limit: 50 } },
        })
      ).data!.data,
  });
  const rejected = useQuery({
    queryKey: ['mod-auto', 'actions', 'rejected'],
    enabled: tab === 'decided',
    queryFn: async () =>
      (await api.GET('/admin/moderation/auto-actions', { params: { query: { status: 'rejected', limit: 50 } } })).data!.data,
  });
  const reporters = useQuery({
    queryKey: ['mod-auto', 'reporters'],
    enabled: tab === 'reporters',
    queryFn: async () => (await api.GET('/admin/moderation/reporters', { params: { query: { limit: 50 } } })).data!.data,
  });
  const strikes = useQuery({
    queryKey: ['mod-auto', 'strikes'],
    enabled: tab === 'strikes',
    queryFn: async () => (await api.GET('/admin/moderation/strikes', { params: { query: { limit: 50 } } })).data!.data,
  });

  const noteOf = (id: string) => {
    const n = (notes[id] ?? '').trim();
    if (!n) throw new Error('Напишите комментарий: человек его увидит.');
    return n;
  };
  const decide = useMutation({
    mutationFn: async (v: { id: string; accept: boolean }) => {
      const r = await api.POST('/admin/moderation/auto-actions/{id}/decision', {
        params: { path: { id: v.id } },
        body: { accept: v.accept, note: noteOf(v.id) },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Решение сохранено, человек уведомлён');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const closeReview = useMutation({
    mutationFn: async (id: string) => {
      const r = await api.POST('/admin/moderation/auto-actions/{id}/close-review', {
        params: { path: { id } },
        body: { note: noteOf(id) },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Проверка закрыта');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const reporterAct = useMutation({
    mutationFn: async (v: { userId: string; op: 'clear' | 'accept' | 'reject' }) => {
      const note = noteOf(v.userId);
      const r =
        v.op === 'clear'
          ? await api.POST('/admin/moderation/reporters/{userId}/clear', { params: { path: { userId: v.userId } }, body: { note } })
          : await api.POST('/admin/moderation/reporters/{userId}/appeal-decision', {
              params: { path: { userId: v.userId } },
              body: { accept: v.op === 'accept', note },
            });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Сохранено');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const r = await api.POST('/admin/moderation/strikes/{id}/revoke', {
        params: { path: { id } },
        body: { note: noteOf(id) },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Страйк снят');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const noteInput = (id: string) => (
    <Input
      aria-label="Комментарий"
      placeholder="Комментарий (его увидит человек)"
      maxLength={500}
      value={notes[id] ?? ''}
      onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))}
    />
  );
  const m = metrics.data;
  const autoRows = [...(actions.data ?? []), ...(tab === 'decided' ? (rejected.data ?? []) : [])];

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Автомодерация"
        subtitle="Система сама скрывает контент и ограничивает аккаунты по весу жалоб, страйкам и проверке текста. Человек подключается только по апелляции."
      />
      {m?.alarm ? (
        <div role="alert" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          Тревога: апелляции отменяют {pct(m.overturnRate)} автоматических решений (порог {m.alarmPercent}%). Поднимите
          пороги или переведите «Автоматические меры» в режим «Тень».
        </div>
      ) : null}
      <ErrorNote text={metrics.error ? errorText(metrics.error) : null} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Автодействий за 14 дней', m?.autoActions],
          ['В режиме «тень»', m?.shadowActions],
          ['Апелляций (доля)', m ? `${m.appeals} (${pct(m.appealRate)})` : undefined],
          ['Отменено апелляциями', m ? `${m.overturned} (${pct(m.overturnRate)})` : undefined],
          ['Ждут ответа', m?.pendingAppeals],
          ['Просрочены по сроку', m?.overdueAppeals],
          ['Приоритетная проверка', m?.priorityReviews],
          [
            'Проверка текста',
            m ? (m.detections.map((d) => `${d.mode}: ${d.count}`).join(', ') || '—') : undefined,
          ],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-line bg-card p-3">
            <div className="text-xs text-muted">{label}</div>
            <div className="text-lg font-medium text-heading">{value ?? '…'}</div>
          </div>
        ))}
      </div>

      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={(Object.keys(TABS) as Tab[]).map((v) => ({ value: v, label: TABS[v] }))}
      />

      {tab === 'pending' || tab === 'review' || tab === 'decided' ? (
        <>
          <ErrorNote text={actions.error ? errorText(actions.error) : null} />
          <Table>
            <thead>
              <tr>
                <Th>Решение системы</Th>
                <Th>Оценка</Th>
                <Th>{tab === 'review' ? 'Что делать' : 'Что пишет человек'}</Th>
                <Th>{tab === 'decided' ? 'Итог' : 'Решение'}</Th>
              </tr>
            </thead>
            <tbody>
              {actions.isPending ? <TableEmpty colSpan={4} loading /> : null}
              {autoRows.map((r) => (
                <tr key={r.id}>
                  <Td className="max-w-sm text-xs">
                    <Badge tone="neutral" dot>
                      {KIND[r.kind] ?? r.kind}
                    </Badge>
                    {!r.enforced ? <span className="ml-1 text-faint">(тень)</span> : null}
                    <div className="mt-1">{r.reason}</div>
                    {r.targetType && r.targetId ? (
                      <Link href={`/moderation/${r.targetType}/${r.targetId}`} className="text-heading hover:underline">
                        {TARGET_TYPE[r.targetType] ?? r.targetType}
                      </Link>
                    ) : null}
                    <div className="text-faint">{formatDateTime(r.createdAt)}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {r.score} / порог {r.threshold}
                    {r.borderline ? <div className="text-warning">пограничное</div> : null}
                  </Td>
                  <Td className="max-w-sm text-xs">
                    {tab === 'review' ? (
                      <Link href={`/users/${r.userId}`} className="text-heading hover:underline">
                        Открыть аккаунт
                      </Link>
                    ) : (
                      r.appealMessage
                    )}
                  </Td>
                  <Td className="min-w-72">
                    {tab === 'pending' ? (
                      <div className="space-y-2">
                        {noteInput(r.id)}
                        <div className="flex gap-2">
                          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, accept: true })}>
                            Одобрить: вернуть всё
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
                    ) : tab === 'review' ? (
                      <div className="space-y-2">
                        {noteInput(r.id)}
                        <Button size="sm" disabled={closeReview.isPending} onClick={() => closeReview.mutate(r.id)}>
                          Закрыть проверку
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs">
                        <Badge tone="neutral">{r.appealStatus === 'accepted' ? 'Одобрено' : 'Оставлено'}</Badge>
                        {r.autoApproved ? <span className="ml-1 text-faint">само, по сроку</span> : null}
                        <div className="mt-1">{r.appealNote}</div>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {!actions.isPending && autoRows.length === 0 ? <TableEmpty colSpan={4}>Здесь пока пусто.</TableEmpty> : null}
            </tbody>
          </Table>
        </>
      ) : null}

      {tab === 'reporters' ? (
        <>
          <ErrorNote text={reporters.error ? errorText(reporters.error) : null} />
          <Table>
            <thead>
              <tr>
                <Th>Жалобщик</Th>
                <Th>Жалобы (приняты / отклонены / ждут)</Th>
                <Th>Статус</Th>
                <Th>Действие</Th>
              </tr>
            </thead>
            <tbody>
              {reporters.isPending ? <TableEmpty colSpan={4} loading /> : null}
              {(reporters.data ?? []).map((r) => (
                <tr key={r.userId}>
                  <Td className="text-xs">
                    <Link href={`/users/${r.userId}`} className="font-medium text-heading hover:underline">
                      {r.name ?? r.userId.slice(0, 8)}
                    </Link>
                    <div className="text-faint">
                      с {formatDateTime(r.accountCreatedAt)}
                      {r.verifiedAttorney ? ' · адвокат с галочкой' : ''}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {r.upheld} / {r.rejected} / {r.pending} (всего {r.total})
                  </Td>
                  <Td className="max-w-xs text-xs">
                    {r.suspendedUntil ? <Badge tone="danger">пауза до {formatDateTime(r.suspendedUntil)}</Badge> : null}
                    {r.warnings > 0 && !r.suspendedUntil ? <Badge tone="warning">предупреждён</Badge> : null}
                    {r.lastReason ? <div className="mt-1 text-muted">{r.lastReason}</div> : null}
                    {r.appealStatus === 'pending' ? <div className="mt-1">Апелляция: {r.appealMessage}</div> : null}
                  </Td>
                  <Td className="min-w-72">
                    {r.warnings > 0 || r.suspendedUntil ? (
                      <div className="space-y-2">
                        {noteInput(r.userId)}
                        <div className="flex flex-wrap gap-2">
                          {r.appealStatus === 'pending' ? (
                            <>
                              <Button size="sm" onClick={() => reporterAct.mutate({ userId: r.userId, op: 'accept' })}>
                                Принять апелляцию
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => reporterAct.mutate({ userId: r.userId, op: 'reject' })}>
                                Отклонить
                              </Button>
                            </>
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => reporterAct.mutate({ userId: r.userId, op: 'clear' })}>
                            Снять
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
              {!reporters.isPending && (reporters.data ?? []).length === 0 ? <TableEmpty colSpan={4}>Жалобщиков пока нет.</TableEmpty> : null}
            </tbody>
          </Table>
        </>
      ) : null}

      {tab === 'strikes' ? (
        <>
          <ErrorNote text={strikes.error ? errorText(strikes.error) : null} />
          <Table>
            <thead>
              <tr>
                <Th>Кому</Th>
                <Th>Очки и причина</Th>
                <Th>Ограничение</Th>
                <Th>Срок</Th>
                <Th>Действие</Th>
              </tr>
            </thead>
            <tbody>
              {strikes.isPending ? <TableEmpty colSpan={5} loading /> : null}
              {(strikes.data ?? []).map((s) => (
                <tr key={s.id}>
                  <Td className="text-xs">
                    <Link href={`/users/${s.userId}`} className="text-heading hover:underline">
                      {s.userId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td className="max-w-xs text-xs">
                    {s.points} · {s.reason ?? '—'}
                  </Td>
                  <Td className="text-xs">{s.restriction ? `${s.restriction} до ${formatDateTime(s.restrictionUntil ?? s.expiresAt)}` : '—'}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {s.revokedAt ? <Badge tone="neutral">снят</Badge> : s.active ? <Badge tone="warning">действует</Badge> : <Badge tone="neutral">истёк</Badge>}
                    <div className="text-faint">до {formatDateTime(s.expiresAt)}</div>
                  </Td>
                  <Td className="min-w-64">
                    {s.active ? (
                      <div className="space-y-2">
                        {noteInput(s.id)}
                        <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                          Снять страйк
                        </Button>
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
              {!strikes.isPending && (strikes.data ?? []).length === 0 ? <TableEmpty colSpan={5}>Страйков нет.</TableEmpty> : null}
            </tbody>
          </Table>
        </>
      ) : null}

      <div className="mt-8">
        <AutoModerationSettingsCard />
      </div>
    </>
  );
}
