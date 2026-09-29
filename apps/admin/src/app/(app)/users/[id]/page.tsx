'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';
import { ROLE_TEXT, StatusBadge } from '@/lib/labels';

type Contacts = {
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  preferredContactNote: string | null;
};

/** docs/06 §2.3 item 3 card + §3.4 sanctions. Contacts are behind a
 * justification (§2.1) and every reveal is audited server-side. */
export default function UserCardPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { ask, dialog } = useReason();
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contacts | null>(null);

  const q = useQuery({
    queryKey: ['user', id],
    queryFn: async () =>
      (await api.GET('/admin/users/{id}', { params: { path: { id } } })).data!.data,
  });
  const u = q.data;
  const canSanction = me?.role === 'super_admin' || me?.role === 'moderator';
  const refresh = () => qc.invalidateQueries({ queryKey: ['user', id] });
  const onError = (e: unknown) => setError(errorText(e));

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
          params: { path: { id }, header: { 'X-Justification': r.text } },
        })
      ).data!.data as Contacts;
    },
    onSuccess: (c) => {
      if (c) setContacts(c);
    },
    onError,
  });

  const act = useMutation({
    mutationFn: async (what: 'revoke' | 'warn' | 'suspend' | 'restore') => {
      const path = { params: { path: { id } } };
      if (what === 'revoke') return api.POST('/admin/users/{id}/sessions/revoke', path);
      if (what === 'restore') return api.POST('/admin/users/{id}/restore', path);
      const r = await ask(
        what === 'warn'
          ? {
              title: 'Предупреждение',
              description: 'Пользователь получит уведомление moderation_notice; причина остаётся в журнале.',
              label: 'Причина (внутренняя)',
              min: 3,
              confirm: 'Предупредить',
            }
          : {
              title: 'Приостановить аккаунт',
              description:
                'Сессии будут отозваны, вход заблокирован; у клиента открытые кейсы уйдут в архив, у адвоката снимутся активные биды.',
              label: 'Причина',
              min: 3,
              confirm: 'Приостановить',
              danger: true,
            },
      );
      if (!r) return null;
      return what === 'warn'
        ? api.POST('/admin/users/{id}/warn', { ...path, body: { reason: r.text } })
        : api.POST('/admin/users/{id}/suspend', { ...path, body: { reason: r.text } });
    },
    onSuccess: (r) => {
      if (r) {
        setError(null);
        void refresh();
      }
    },
    onError,
  });

  if (!u) {
    return (
      <>
        <PageHeader title="Пользователь" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
      </>
    );
  }
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';

  return (
    <>
      {dialog}
      <PageHeader
        title={name}
        subtitle={`${u.role ? ROLE_TEXT[u.role] ?? u.role : 'без роли'} · ${u.id}`}
        actions={
          u.role !== 'admin' ? (
            <>
              <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate('revoke')}>
                Отозвать сессии
              </Button>
              {canSanction ? (
                <>
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
      <ErrorNote text={error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
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
                <Row k="Верификация" v={u.attorney.verificationStatus} />
                <Row k="Лицензии" v={u.attorney.licenses.join(', ') || '—'} />
                <Row k="Рейтинг" v={`${u.attorney.ratingAvg.toFixed(1)} (${u.attorney.ratingCount})`} />
                <Row k="Подписчики / посты" v={`${u.attorney.followersCount} / ${u.attorney.postsCount}`} />
                <Row
                  k="Подписка"
                  v={
                    u.attorney.subscription
                      ? `${u.attorney.subscription.status}${u.attorney.subscription.currentPeriodEnd ? ` до ${formatDateTime(u.attorney.subscription.currentPeriodEnd)}` : ''}`
                      : 'нет'
                  }
                />
              </>
            ) : null}
            {u.client ? (
              <>
                <Row k="Штат" v={u.client.stateCode} />
                <Row k="Связь" v={u.client.preferredContactMethod ?? '—'} />
                <Row k="Языки" v={u.client.preferredLanguages.join(', ')} />
              </>
            ) : null}
          </CardContent>
        </Card>
        <Card>
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
                  <Button size="sm" variant="outline" disabled={reveal.isPending} onClick={() => reveal.mutate()}>
                    Показать (с причиной)
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Сессии и устройства</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {u.sessions.length === 0 ? (
              <p className="text-muted">Нет активных сессий</p>
            ) : (
              <ul className="space-y-2">
                {u.sessions.map((s) => (
                  <li key={s.sessionChainId} className="rounded-md bg-canvas p-2">
                    <div className="font-medium">{s.deviceName ?? 'Устройство'}</div>
                    <div className="text-xs text-muted">
                      {[s.platform, s.appVersion, s.ip].filter(Boolean).join(' · ')}
                      {s.pushTokens ? ` · push ×${s.pushTokens}` : ''}
                    </div>
                    <div className="text-xs text-muted">активна: {formatDateTime(s.lastUsedAt ?? s.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {u.role === 'client' ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-muted">Кейсы (последние 20)</h2>
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
              {u.cases.map((c) => (
                <tr key={c.id}>
                  <Td>
                    {c.title}
                    <div className="text-xs text-muted">{c.id}</div>
                  </Td>
                  <Td>
                    <Badge>{c.status}</Badge>
                  </Td>
                  <Td>{c.stateCode}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
      {u.role === 'attorney' ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-muted">Биды (последние 20)</h2>
          <Table>
            <thead>
              <tr>
                <Th>Кейс</Th>
                <Th>Статус</Th>
                <Th>Сумма</Th>
                <Th>Создан</Th>
              </tr>
            </thead>
            <tbody>
              {u.bids.map((b) => (
                <tr key={b.id}>
                  <Td>
                    {b.caseTitle}
                    <div className="text-xs text-muted">{b.caseId}</div>
                  </Td>
                  <Td>
                    <Badge>{b.status}</Badge>
                  </Td>
                  <Td>
                    {b.feeType === 'free_consultation' ? 'бесплатная консультация' : `$${(b.amountCents / 100).toFixed(0)}${b.feeType === 'hourly' ? '/ч' : ''}`}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateTime(b.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
