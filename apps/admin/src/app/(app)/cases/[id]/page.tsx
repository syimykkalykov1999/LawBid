'use client';

import { Archive, ArrowCounterClockwise, ArrowLeft, EyeSlash, Flag, LockSimple, RocketLaunch, Scales, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fadeUp } from '@/components/billing/shared';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { growthError } from '@/components/growth/errors';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { BID_STATUS, CASE_STATUS, FEE_TYPE, JOURNAL_EVENT, label, PARTY_ROLE, partyName, StatusPill, usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type CaseCard = components['schemas']['AdminCaseCardDto'];
type Action = 'hide' | 'close' | 'archive' | 'restore';

const ACTIONS: Record<Action, { title: string; description: string; confirm: string; done: string; danger: boolean }> = {
  hide: {
    title: 'Скрыть кейс',
    description: 'Кейс уйдёт из ленты (в архив), активные ставки будут отклонены. Клиент получит уведомление с причиной.',
    confirm: 'Скрыть',
    done: 'Кейс скрыт',
    danger: true,
  },
  close: {
    title: 'Закрыть кейс',
    description: 'Активные ставки будут отклонены, клиент получит уведомление о закрытии.',
    confirm: 'Закрыть',
    done: 'Кейс закрыт',
    danger: true,
  },
  archive: {
    title: 'Отправить в архив',
    description: 'Активные ставки будут отклонены, клиент получит уведомление.',
    confirm: 'В архив',
    done: 'Кейс в архиве',
    danger: true,
  },
  restore: {
    title: 'Восстановить кейс',
    description: 'Кейс снова станет открытым и появится в ленте.',
    confirm: 'Восстановить',
    done: 'Кейс восстановлен',
    danger: false,
  },
};

/** Admin case card: details, bids, journal, related disputes and contact issues. */
export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const { data: me } = useMe();
  const canWrite = me?.role === 'super_admin' || me?.role === 'support';
  const canOpenUsers = me?.role === 'super_admin' || me?.role === 'support' || me?.role === 'moderator' || me?.role === 'finance';

  const q = useQuery({
    queryKey: ['admin-case', id],
    queryFn: async () => (await api.GET('/admin/cases/{id}', { params: { path: { id } } })).data!.data,
  });
  const c = q.data;

  const act = useMutation({
    mutationFn: async (action: Action) => {
      const a = ACTIONS[action];
      const r = await ask({ title: a.title, description: a.description, label: 'Причина', confirm: a.confirm, danger: a.danger });
      if (!r) return null;
      const opts = { params: { path: { id } }, body: { reason: r.text } };
      const res =
        action === 'hide'
          ? await api.POST('/admin/cases/{id}/hide', opts)
          : action === 'close'
            ? await api.POST('/admin/cases/{id}/close', opts)
            : action === 'archive'
              ? await api.POST('/admin/cases/{id}/archive', opts)
              : await api.POST('/admin/cases/{id}/restore', opts);
      return { action, data: res.data!.data };
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(ACTIONS[r.action].done);
      qc.setQueryData(['admin-case', id], r.data);
      void qc.invalidateQueries({ queryKey: ['admin-cases'] });
    },
    onError: (e) => {
      toast.error(growthError(e));
      void qc.invalidateQueries({ queryKey: ['admin-case', id] });
    },
  });

  const back = (
    <Link href="/cases" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft size={14} /> Все кейсы
    </Link>
  );

  if (!c) {
    return (
      <>
        {back}
        <PageHeader eyebrow="Кейсы" title="Кейс" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-[var(--radius-lg)] lg:col-span-2" />
            <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
          </div>
        ) : null}
      </>
    );
  }

  const actions: Action[] = c.status === 'open' ? ['hide', 'close', 'archive'] : c.status === 'archived' ? ['restore'] : [];
  const icons: Record<Action, React.ReactNode> = {
    hide: <EyeSlash size={15} />,
    close: <LockSimple size={15} />,
    archive: <Archive size={15} />,
    restore: <ArrowCounterClockwise size={15} />,
  };

  return (
    <>
      {dialog}
      {back}
      <PageHeader
        eyebrow="Кейсы · Карточка"
        title={c.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill map={CASE_STATUS} value={c.status} />
            {c.promoted ? (
              <Badge tone="gold">
                <RocketLaunch size={11} /> продвигается{c.promotedUntil ? ` до ${formatDateTime(c.promotedUntil)}` : ''}
              </Badge>
            ) : null}
            {c.openReports > 0 ? (
              <Badge tone="danger">
                <Flag size={11} /> жалоб: {c.openReports}
              </Badge>
            ) : null}
            <span>создан {formatDateTime(c.createdAt)}</span>
          </span>
        }
        actions={
          canWrite && actions.length ? (
            <>
              {actions.map((a) => (
                <Button key={a} size="sm" variant={a === 'restore' ? 'soft' : a === 'hide' ? 'danger-soft' : 'outline'} disabled={act.isPending} onClick={() => act.mutate(a)}>
                  {icons[a]} {ACTIONS[a].confirm}
                </Button>
              ))}
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div {...fadeUp(0)} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Описание</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{c.description}</p>
              {c.photosCount > 0 ? <p className="mt-3 text-xs text-faint">Фото: {c.photosCount}</p> : null}
            </CardContent>
          </Card>
        </motion.div>
        <motion.div {...fadeUp(1)}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Кратко</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-sm">
                <Row k="Клиент">
                  {canOpenUsers ? (
                    <Link href={`/users/${c.client.id}`} className="font-medium text-gold-600 hover:underline">
                      {c.clientName || partyName(c.client)}
                    </Link>
                  ) : (
                    c.clientName || partyName(c.client)
                  )}
                </Row>
                <Row k="Бюджет">{c.budgetMode === 'amount' ? usd(c.budgetCents) : <span className="text-muted">уточнить позже</span>}</Row>
                <Row k="Область права">{c.practiceAreaName}</Row>
                <Row k="Штаты">
                  <span className="flex flex-wrap justify-end gap-1">
                    {(c.states.length ? c.states : [{ code: c.stateCode, isPrimary: true }]).map((s) => (
                      <Badge key={s.code} tone={s.isPrimary ? 'gold' : 'neutral'}>
                        {s.code}
                      </Badge>
                    ))}
                    {c.city ? <span className="text-muted">· {c.city}</span> : null}
                  </span>
                </Row>
                <Row k="Ставки / комм. / просмотры">
                  <span className="whitespace-nowrap tabular-nums">
                    {c.bidsCount} / {c.commentCount} / {c.viewCount}
                  </span>
                </Row>
                <Row k="Последняя активность">{formatDateTime(c.lastActivityAt)}</Row>
                {c.closedAt ? <Row k="Закрыт">{formatDateTime(c.closedAt)}</Row> : null}
                {c.archivedAt ? <Row k="В архиве с">{formatDateTime(c.archivedAt)}</Row> : null}
              </dl>
              {c.disputeIds.length || c.contactIssueIds.length ? (
                <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
                  {c.disputeIds.map((d, i) => (
                    <Link key={d} href={`/cases/disputes/${d}`} className="flex items-center gap-1.5 text-gold-600 hover:underline">
                      <Scales size={14} /> Спор {c.disputeIds.length > 1 ? `№${i + 1}` : ''} →
                    </Link>
                  ))}
                  {c.contactIssueIds.map((d, i) => (
                    <Link key={d} href={`/cases/contact-issues/${d}`} className="flex items-center gap-1.5 text-gold-600 hover:underline">
                      <WarningCircle size={14} /> «Не могу связаться» {c.contactIssueIds.length > 1 ? `№${i + 1}` : ''} →
                    </Link>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <h2 className="mt-9 mb-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Ставки</h2>
      <Bids c={c} canOpenUsers={canOpenUsers} />

      <h2 className="mt-9 mb-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Журнал кейса</h2>
      <motion.div {...fadeUp(2)}>
        <Card>
          <CardContent className="pt-5">
            {c.journal.length === 0 ? (
              <p className="text-sm text-muted">Записей нет.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-line pl-4 text-sm">
                {c.journal.map((j) => (
                  <li key={j.id}>
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-gold" />
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-heading">{JOURNAL_EVENT[j.eventType] ?? j.eventType}</span>
                      <span className="text-xs text-muted">
                        {j.actorRole ? label(PARTY_ROLE, j.actorRole) : 'система'} · {formatDateTime(j.createdAt)}
                      </span>
                    </div>
                    {j.payload && Object.keys(j.payload).length ? (
                      <details className="text-xs text-muted">
                        <summary className="cursor-pointer">детали</summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2">{JSON.stringify(j.payload, null, 2)}</pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

function Bids({ c, canOpenUsers }: { c: CaseCard; canOpenUsers: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Адвокат</Th>
          <Th className="text-right">Сумма</Th>
          <Th>Тип</Th>
          <Th>Статус</Th>
          <Th className="text-right">Раундов</Th>
          <Th>Создана</Th>
        </tr>
      </thead>
      <tbody>
        {c.bids.length === 0 ? (
          <TableEmpty colSpan={6}>Ставок нет</TableEmpty>
        ) : (
          c.bids.map((b) => (
            <tr key={b.id}>
              <Td>
                {canOpenUsers ? (
                  <Link href={`/users/${b.attorneyId}`} className="font-medium text-ink underline-offset-2 hover:text-gold-600 hover:underline">
                    {b.attorneyName}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{b.attorneyName}</span>
                )}
                {b.id === c.acceptedBidId ? (
                  <Badge tone="success" className="ml-2">
                    выбрана
                  </Badge>
                ) : null}
              </Td>
              <Td className="text-right whitespace-nowrap tabular-nums">{b.feeType === 'free_consultation' ? '—' : usd(b.amountCents)}</Td>
              <Td className="text-muted">{label(FEE_TYPE, b.feeType)}</Td>
              <Td>
                <StatusPill map={BID_STATUS} value={b.status} />
              </Td>
              <Td className="text-right tabular-nums">{b.rounds}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(b.createdAt)}</Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
