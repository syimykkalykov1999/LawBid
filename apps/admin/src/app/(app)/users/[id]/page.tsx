'use client';

import { DeviceMobile, Eye, Briefcase, Gavel } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { SubscriptionCard } from '@/components/subscription-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import {
  BID_STATUS,
  CASE_STATUS,
  ROLE_TEXT,
  StatusBadge,
  StatusPill,
  SUBSCRIPTION_STATUS,
  usd,
  VERIFICATION_STATUS,
} from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Contacts = {
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  preferredContactNote: string | null;
};

const CONTACT_METHOD: Record<string, string> = {
  phone: 'телефон',
  email: 'email',
  sms: 'SMS',
  any: 'любой',
};

type Act = 'revoke' | 'warn' | 'suspend' | 'restore' | 'phone';
const ACT_DONE: Record<Act, string> = {
  revoke: 'Все сессии отозваны',
  warn: 'Предупреждение отправлено',
  suspend: 'Аккаунт приостановлен',
  restore: 'Аккаунт восстановлен',
  phone: 'Телефон изменён',
};

/** docs/06 §2.3 item 3 card + §3.4 sanctions. Contacts are behind a
 * justification (§2.1) and every reveal is audited server-side. */
export default function UserCardPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const { ask, dialog } = useReason();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [contacts, setContacts] = useState<Contacts | null>(null);

  const q = useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await api.GET('/admin/users/{id}', { params: { path: { id } } })).data!.data,
  });
  const u = q.data;
  const canSanction = me?.role === 'super_admin' || me?.role === 'moderator';
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['user', id] });
    void qc.invalidateQueries({ queryKey: ['users'] });
  };

  const reveal = useMutation({
    mutationFn: async () => {
      const r = await ask({
        title: 'Причина просмотра контактов',
        description: 'Записывается в журнал аудита (docs/06 §2.1).',
        label: 'Причина',
        confirm: 'Показать',
      });
      if (!r) return null;
      return (
        await api.GET('/admin/users/{id}/contacts', {
          params: { path: { id }, header: { 'X-Justification': encodeURIComponent(r.text) } },
        })
      ).data!.data as Contacts;
    },
    onSuccess: (c) => {
      if (c) {
        setContacts(c);
        toast.success('Контакты открыты, просмотр записан в журнал');
      }
    },
    onError: (e) => toast.error(e),
  });

  const act = useMutation({
    mutationFn: async (what: Act) => {
      const path = { params: { path: { id } } };
      if (what === 'phone') {
        // Owner 2026-10-01: a new number on the user's request (lost phone).
        const p = await ask({
          title: 'Сменить телефон по запросу',
          description:
            'Новый номер в формате +13125550123. Старый номер перестанет работать, все сессии будут закрыты, пользователь получит уведомление и письмо.',
          label: 'Новый номер',
          min: 9,
          confirm: 'Дальше',
        });
        if (!p) return null;
        const phone = p.text.replace(/[\s()-]/g, '');
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
          toast.error('Номер должен быть в формате +13125550123');
          return null;
        }
        const r = await ask({
          title: `Сменить на ${phone}?`,
          description: 'Укажите, как вы подтвердили личность (документ, звонок, письмо с почты аккаунта). Причина попадает в журнал.',
          label: 'Причина и как проверили личность',
          min: 5,
          confirm: 'Сменить номер',
          danger: true,
        });
        if (!r) return null;
        await api.POST('/admin/users/{id}/phone', { ...path, body: { phone, reason: r.text } });
        return what;
      }
      if (what === 'revoke') {
        const ok = await confirm({
          title: 'Отозвать все сессии?',
          description: 'Пользователь выйдет на всех устройствах и должен будет войти заново.',
          confirm: 'Отозвать',
          danger: true,
        });
        if (!ok) return null;
        await api.POST('/admin/users/{id}/sessions/revoke', path);
        return what;
      }
      if (what === 'restore') {
        const ok = await confirm({
          title: 'Восстановить аккаунт?',
          description: 'Пользователь снова сможет входить в приложение.',
          confirm: 'Восстановить',
        });
        if (!ok) return null;
        await api.POST('/admin/users/{id}/restore', path);
        return what;
      }
      const r = await ask(
        what === 'warn'
          ? {
              title: 'Предупреждение',
              description: 'Пользователь получит уведомление о модерации; причина остаётся в журнале.',
              label: 'Причина (внутренняя)',
              min: 3,
              confirm: 'Предупредить',
            }
          : {
              title: 'Приостановить аккаунт',
              description:
                'Сессии будут отозваны, вход заблокирован; у клиента открытые кейсы уйдут в архив, у адвоката снимутся активные ставки.',
              label: 'Причина',
              min: 3,
              confirm: 'Приостановить',
              danger: true,
            },
      );
      if (!r) return null;
      if (what === 'warn') await api.POST('/admin/users/{id}/warn', { ...path, body: { reason: r.text } });
      else await api.POST('/admin/users/{id}/suspend', { ...path, body: { reason: r.text } });
      return what;
    },
    onSuccess: (what) => {
      if (what) {
        toast.success(ACT_DONE[what]);
        refresh();
      }
    },
    onError: (e) => toast.error(e),
  });

  if (!u) {
    return (
      <>
        <PageHeader eyebrow="Люди" title="Пользователь" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : null}
      </>
    );
  }
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
  const sub = u.attorney?.subscription;

  return (
    <>
      {dialog}
      {confirmDialog}
      <PageHeader
        eyebrow="Люди"
        title={name}
        subtitle={
          <>
            {u.role ? ROLE_TEXT[u.role] ?? u.role : 'без роли'} · <span className="font-mono text-xs">{u.id}</span>
          </>
        }
        actions={
          u.role !== 'admin' ? (
            <>
              <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate('revoke')}>
                Отозвать сессии
              </Button>
              {canSanction ? (
                <>
                  {me?.role === 'super_admin' ? (
                    // The API allows phone changes to super admins only.
                    <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate('phone')}>
                      Сменить телефон
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate('warn')}>
                    Предупредить
                  </Button>
                  {u.status === 'suspended' ? (
                    <Button size="sm" disabled={act.isPending} onClick={() => act.mutate('restore')}>
                      Восстановить
                    </Button>
                  ) : (
                    <Button variant="danger" size="sm" disabled={act.isPending} onClick={() => act.mutate('suspend')}>
                      Приостановить
                    </Button>
                  )}
                </>
              ) : null}
            </>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn i={0}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Аккаунт</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row k="Статус" v={<StatusBadge status={u.status} />} />
              {u.suspendedReason ? <Row k="Причина" v={u.suspendedReason} /> : null}
              <Row k="Язык" v={u.uiLanguage} />
              <Row k="Создан" v={formatDateTime(u.createdAt)} />
              <Row k="Предупреждений" v={String(u.warnings)} />
              {u.attorney ? (
                <>
                  <Row k="Username" v={`@${u.attorney.username}`} />
                  <Row k="Фирма" v={u.attorney.firmName ?? '—'} />
                  <Row k="Верификация" v={<StatusPill map={VERIFICATION_STATUS} value={u.attorney.verificationStatus} />} />
                  <Row k="Лицензии" v={u.attorney.licenses.join(', ') || '—'} />
                  <Row k="Рейтинг" v={`${u.attorney.ratingAvg.toFixed(1)} (${u.attorney.ratingCount})`} />
                  <Row k="Подписчики / посты" v={`${u.attorney.followersCount} / ${u.attorney.postsCount}`} />
                  <Row
                    k="Подписка"
                    v={
                      sub ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <StatusPill map={SUBSCRIPTION_STATUS} value={sub.status} />
                          {sub.currentPeriodEnd ? (
                            <span className="text-xs text-muted">до {formatDateTime(sub.currentPeriodEnd)}</span>
                          ) : null}
                        </span>
                      ) : (
                        'нет'
                      )
                    }
                  />
                </>
              ) : null}
              {u.client ? (
                <>
                  <Row k="Штат" v={u.client.stateCode} />
                  <Row
                    k="Связь"
                    v={u.client.preferredContactMethod ? CONTACT_METHOD[u.client.preferredContactMethod] ?? u.client.preferredContactMethod : '—'}
                  />
                  <Row k="Языки" v={u.client.preferredLanguages.join(', ')} />
                </>
              ) : null}
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn i={1}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Контакты</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {contacts ? (
                <>
                  <Row k="Email" v={contacts.email ?? '—'} />
                  <Row k="Телефон" v={contacts.phone ?? '—'} />
                  {contacts.preferredContactNote ? <Row k="Заметка" v={contacts.preferredContactNote} /> : null}
                </>
              ) : (
                <>
                  <p className="text-muted">
                    {u.hasEmail ? 'email' : ''}
                    {u.hasEmail && u.hasPhone ? ' · ' : ''}
                    {u.hasPhone ? 'телефон' : ''}
                    {!u.hasEmail && !u.hasPhone ? 'нет контактов' : ' — скрыты'}
                  </p>
                  {u.hasEmail || u.hasPhone ? (
                    <Button size="sm" variant="outline" loading={reveal.isPending} onClick={() => reveal.mutate()}>
                      <Eye size={16} weight="light" />
                      Показать (с причиной)
                    </Button>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </FadeIn>
        <FadeIn i={2}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Сессии и устройства</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {u.sessions.length === 0 ? (
                <p className="text-muted">Нет активных сессий</p>
              ) : (
                <ul className="space-y-2">
                  {u.sessions.map((s) => (
                    <li key={s.sessionChainId} className="flex gap-3 rounded-xl bg-surface-2 p-2.5">
                      <DeviceMobile size={18} weight="light" className="mt-0.5 shrink-0 text-faint" />
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{s.deviceName ?? 'Устройство'}</div>
                        <div className="text-xs text-muted">
                          {[s.platform, s.appVersion, s.ip].filter(Boolean).join(' · ')}
                          {s.pushTokens ? ` · push ×${s.pushTokens}` : ''}
                        </div>
                        <div className="text-xs text-faint">активна: {formatDateTime(s.lastUsedAt ?? s.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>
      {u.role === 'client' ? (
        <section>
          <SectionTitle>Кейсы (последние 20)</SectionTitle>
          {u.cases.length === 0 ? (
            <EmptyState icon={Briefcase} title="Кейсов нет" text="Клиент ещё не создавал кейсы." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Название</Th>
                  <Th>Статус</Th>
                  <Th>Штат</Th>
                  <Th>Создан</Th>
                </tr>
              </thead>
              <tbody>
                {u.cases.map((c, i) => (
                  <MotionRow key={c.id} i={i}>
                    <Td>
                      <Link href={`/cases/${c.id}`} className="font-medium text-heading hover:underline">
                        {c.title}
                      </Link>
                      <div className="font-mono text-xs text-faint">{c.id}</div>
                    </Td>
                    <Td>
                      <StatusPill map={CASE_STATUS} value={c.status} />
                    </Td>
                    <Td>{c.stateCode}</Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(c.createdAt)}</Td>
                  </MotionRow>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      ) : null}
      {u.role === 'attorney' && (me?.role === 'super_admin' || me?.role === 'finance' || me?.role === 'support') ? (
        <div className="mt-6 max-w-xl">
          <SubscriptionCard userId={u.id} />
        </div>
      ) : null}
      {u.role === 'attorney' ? (
        <section>
          <SectionTitle>Ставки (последние 20)</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Кейс</Th>
                <Th>Статус</Th>
                <Th>Сумма</Th>
                <Th>Создана</Th>
              </tr>
            </thead>
            <tbody>
              {u.bids.length === 0 ? (
                <TableEmpty colSpan={4}>
                  <span className="inline-flex items-center gap-2">
                    <Gavel size={16} weight="light" /> Ставок нет
                  </span>
                </TableEmpty>
              ) : (
                u.bids.map((b, i) => (
                  <MotionRow key={b.id} i={i}>
                    <Td>
                      <Link href={`/cases/${b.caseId}`} className="font-medium text-heading hover:underline">
                        {b.caseTitle}
                      </Link>
                      <div className="font-mono text-xs text-faint">{b.caseId}</div>
                    </Td>
                    <Td>
                      <StatusPill map={BID_STATUS} value={b.status} />
                    </Td>
                    <Td className="tabular-nums">
                      {b.feeType === 'free_consultation'
                        ? 'бесплатная консультация'
                        : `${usd(b.amountCents)}${b.feeType === 'hourly' ? '/ч' : ''}`}
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(b.createdAt)}</Td>
                  </MotionRow>
                ))
              )}
            </tbody>
          </Table>
        </section>
      ) : null}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="text-right text-ink">{v}</span>
    </div>
  );
}
