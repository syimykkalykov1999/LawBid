'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FRAUD_NOTE_MAX, fraudCardKey, invalidateFraud, useBanDialog } from '@/components/fraud/client-fraud';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import {
  FRAUD_ACTOR_RU,
  FRAUD_QUEUE_REASON_RU,
  FRAUD_SIGNAL_RU,
  FraudEventChip,
  FraudStatusChip,
  fraudUserName,
  KindChips,
  maskedContacts,
} from '@/lib/fraud-labels';
import { useMe } from '@/lib/hooks';
import { ROLE_TEXT, STATUS_LABEL } from '@/lib/labels';
import { can, canOpen } from '@/lib/rbac';
import { cn, formatDateTime } from '@/lib/utils';

/**
 * Owner 2026-10-05 — «Борьба с мошенниками → Клиенты», one person's card:
 * why the score is what it is, which accounts share a phone, e-mail,
 * Apple / Google, card or device with this one (kinds only, never values),
 * the history and the staff actions over /admin/fraud/users/:id/*.
 */
export default function ClientFraudCardPage() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canManage = me ? can(me, 'verification', 'manage') : false;
  const canUsers = me ? canOpen(me, '/users') : false;
  const { ask, dialog } = useReason();
  const { askBan, dialog: banDialog } = useBanDialog();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const q = useQuery({
    queryKey: fraudCardKey(userId),
    queryFn: async () => (await api.GET('/admin/fraud/users/{userId}', { params: { path: { userId } } })).data!.data,
  });
  const c = q.data;
  const p = { params: { path: { userId } } };
  const onError = (e: unknown) => toast.error(e);
  const done = (text: string) => {
    toast.success(text);
    invalidateFraud(qc, userId);
    void qc.invalidateQueries({ queryKey: ['user', userId] });
  };

  const clear = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Снять',
        description: 'Человек возвращается в статус «В порядке»; если аккаунт был заблокирован этой защитой — он восстанавливается. Текущий балл запоминается: снова в очередь — только если балл вырастет.',
        label: 'Что проверили (необязательно)',
        optionalText: true,
        max: FRAUD_NOTE_MAX,
        confirm: 'Снять',
      });
      if (!a) return null;
      return api.POST('/admin/fraud/users/{userId}/clear', { ...p, body: a.text ? { note: a.text } : {} });
    },
    onSuccess: (x) => x && done('Снято'),
    onError,
  });
  const restrict = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Ограничить',
        description: 'Человек не сможет публиковать кейсы и писать адвокатам, пока сотрудник не снимет ограничение.',
        label: 'Почему ограничиваете',
        min: 3,
        max: FRAUD_NOTE_MAX,
        confirm: 'Ограничить',
        danger: true,
      });
      if (!a) return null;
      return api.POST('/admin/fraud/users/{userId}/restrict', { ...p, body: { note: a.text } });
    },
    onSuccess: (x) => x && done('Ограничен'),
    onError,
  });
  const ban = useMutation({
    mutationFn: async () => {
      if (!c) return null;
      const b = await askBan(`Заблокировать — ${fraudUserName(c.user)}`, c.linked.filter((l) => !l.blocked).length);
      if (!b) return null;
      return (await api.POST('/admin/fraud/users/{userId}/ban', { ...p, body: { note: b.note, includeLinked: b.includeLinked } })).data!.data;
    },
    onSuccess: (r) => r && done(r.banned > 1 ? `Заблокировано аккаунтов: ${r.banned}` : 'Заблокирован'),
    onError,
  });
  const recompute = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Пересчитать?',
        description: 'Балл риска и связи будут вычислены заново из жалоб, возвратов и отпечатков.',
        confirm: 'Пересчитать',
      });
      if (!ok) return null;
      return api.POST('/admin/fraud/users/{userId}/recompute', p);
    },
    onSuccess: (x) => x && done('Пересчитано'),
    onError,
  });
  const busy = clear.isPending || restrict.isPending || ban.isPending || recompute.isPending;
  const signals = c ? [...c.signals].sort((a, b) => b.points - a.points) : [];

  return (
    <>
      {dialog}
      {banDialog}
      {confirmDialog}
      <PageHeader
        eyebrow="Люди · Верификация · Борьба с мошенниками"
        title={c ? fraudUserName(c.user) : 'Клиент'}
        subtitle={
          c ? (
            <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 break-words">{maskedContacts(c.user)}</span>
              <FraudStatusChip status={c.status} />
              <Badge tone={c.score > 0 ? 'warning' : 'neutral'}>балл {c.score}</Badge>
              {canUsers ? (
                <Link href={`/users/${c.user.id}`} className="text-gold-600 hover:underline">
                  открыть в «Люди»
                </Link>
              ) : null}
              <Link href="/verification/trust?tab=clients" className="text-gold-600 hover:underline">
                ← к очереди
              </Link>
            </span>
          ) : undefined
        }
      />
      {q.isPending ? (
        <Skeleton className="h-56 rounded-[var(--radius-lg)]" />
      ) : !c ? (
        <ErrorNote text={q.error ? errorText(q.error) : 'Не удалось загрузить карточку'} />
      ) : (
        <>
          <Card>
            <CardHeader className="flex-wrap">
              <CardTitle>Риск</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <FraudStatusChip status={c.status} />
                {c.queueReason ? (
                  <Badge tone={FRAUD_QUEUE_REASON_RU[c.queueReason]?.tone ?? 'neutral'}>{FRAUD_QUEUE_REASON_RU[c.queueReason]?.text ?? c.queueReason}</Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="min-w-0">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Аккаунт</h4>
                  <ul className="space-y-1.5">
                    <Row k="Роль" v={c.user.role ? (ROLE_TEXT[c.user.role] ?? c.user.role) : '—'} />
                    <Row k="Аккаунт" v={STATUS_LABEL[c.user.accountStatus] ?? c.user.accountStatus} />
                    <Row k="Зарегистрирован" v={formatDateTime(c.user.createdAt)} />
                    <Row k="Балл риска" v={<span className="font-semibold tabular-nums text-heading">{c.score}</span>} />
                    {c.queuedAt ? <Row k="В очереди с" v={formatDateTime(c.queuedAt)} /> : null}
                    {c.clearedAt ? <Row k="Снято сотрудником" v={`${formatDateTime(c.clearedAt)}${c.clearedScore != null ? ` · при балле ${c.clearedScore}` : ''}`} /> : null}
                    <Row k="Посчитано" v={formatDateTime(c.computedAt)} />
                  </ul>
                </section>
                <section className="min-w-0">
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Из чего балл</h4>
                  {signals.length === 0 ? <p className="text-muted">Сигналов нет.</p> : null}
                  <ul className="space-y-1.5">
                    {signals.map((s) => (
                      <li key={s.code} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-muted">
                          {FRAUD_SIGNAL_RU[s.code] ?? s.code}
                          {s.count > 1 ? <span className="ml-1 text-xs text-faint">×{s.count}</span> : null}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-ink">+{s.points}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {canManage ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Button size="sm" variant="gold" className="w-full" disabled={busy} loading={clear.isPending} onClick={() => clear.mutate()}>
                    Снять
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    className="w-full"
                    disabled={busy || c.status === 'restricted' || c.status === 'banned'}
                    loading={restrict.isPending}
                    onClick={() => restrict.mutate()}
                  >
                    Ограничить
                  </Button>
                  <Button size="sm" variant="danger" className="w-full" disabled={busy || c.status === 'banned'} loading={ban.isPending} onClick={() => ban.mutate()}>
                    Заблокировать
                  </Button>
                  <Button size="sm" variant="ghost" className="w-full" disabled={busy} loading={recompute.isPending} onClick={() => recompute.mutate()}>
                    Пересчитать
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <h2 className="mt-9 mb-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Связанные аккаунты</h2>
          <Table>
            <thead>
              <tr>
                <Th>Человек</Th>
                <Th>Что общего</Th>
                <Th>Статус</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {c.linked.length === 0 ? (
                <TableEmpty colSpan={4}>Других аккаунтов с тем же телефоном, почтой, Apple/Google, картой или устройством нет.</TableEmpty>
              ) : (
                c.linked.map((l, i) => (
                  <MotionRow key={l.user.id} i={i} className={cn(l.blocked && 'bg-danger-soft/30')}>
                    <Td className="max-w-64">
                      <Link href={`/verification/trust/clients/${l.user.id}`} className="block truncate font-medium text-heading hover:underline">
                        {fraudUserName(l.user)}
                      </Link>
                      <div className="truncate text-xs text-faint">{maskedContacts(l.user)}</div>
                      <div className="text-xs text-faint">
                        {l.user.role ? (ROLE_TEXT[l.user.role] ?? l.user.role) : '—'} · с {formatDateTime(l.user.createdAt)}
                      </div>
                    </Td>
                    <Td>
                      <div className="max-w-64">
                        <KindChips kinds={l.kinds} />
                      </div>
                    </Td>
                    <Td>
                      {l.blocked ? (
                        <Badge tone="danger" dot>
                          Заблокирован
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted">{STATUS_LABEL[l.user.accountStatus] ?? l.user.accountStatus}</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <Link href={`/verification/trust/clients/${l.user.id}`} className="shrink-0 text-xs whitespace-nowrap text-gold-600 hover:underline">
                          карточка →
                        </Link>
                      </div>
                    </Td>
                  </MotionRow>
                ))
              )}
            </tbody>
          </Table>

          <h2 className="mt-9 mb-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">История</h2>
          {c.events.length === 0 ? <p className="text-sm text-muted">Событий нет.</p> : null}
          <ol className="relative space-y-3 border-l border-line pl-5">
            {c.events.map((e) => (
              <li key={e.id} className="relative">
                <span aria-hidden className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-line-strong" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <FraudEventChip kind={e.kind} />
                    <KindChips kinds={e.kinds} />
                  </span>
                  <span className="shrink-0 text-xs text-faint">{formatDateTime(e.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-xs break-words text-muted">
                  {e.actorType === 'admin' ? (e.actorName ?? FRAUD_ACTOR_RU.admin) : (FRAUD_ACTOR_RU[e.actorType] ?? e.actorType)}
                  {e.score != null ? ` · балл ${e.score}` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="shrink-0 text-muted">{k}</span>
      <span className="min-w-0 text-right break-words">{v}</span>
    </li>
  );
}
