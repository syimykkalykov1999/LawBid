'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
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
import { REQUEST_STATUS } from '@/lib/labels';

const REJECTION: { value: string; label: string }[] = [
  { value: 'license_not_found', label: 'Лицензия не найдена' },
  { value: 'license_inactive', label: 'Лицензия неактивна' },
  { value: 'name_mismatch', label: 'Имя не совпадает' },
  { value: 'document_unreadable', label: 'Документ нечитаем' },
  { value: 'document_expired', label: 'Документ просрочен' },
  { value: 'selfie_mismatch', label: 'Селфи не совпадает' },
  { value: 'suspected_fraud', label: 'Подозрение на мошенничество' },
  { value: 'incomplete_submission', label: 'Неполная заявка' },
  { value: 'other', label: 'Другое' },
];
const DOC_TYPE: Record<string, string> = {
  bar_license: 'Лицензия (bar)',
  drivers_license: 'Водительское удостоверение',
  passport: 'Паспорт',
  state_id: 'ID штата',
  selfie: 'Селфи',
  other: 'Другое',
};

/** docs/06 §2.3 item 2 — the request card over the file-03 §2.5 API:
 * take → per-license decisions (with re-check) → approve / request info /
 * reject; documents open by signed link after a justification. */
export default function VerificationCardPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { ask, dialog } = useReason();
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['verification', id],
    queryFn: async () =>
      (await api.GET('/admin/verification/requests/{id}', { params: { path: { id } } })).data!.data,
  });
  const r = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['verification', id] });
  const onError = (e: unknown) => setError(errorText(e));
  const done = () => {
    setError(null);
    void refresh();
  };
  const mine = Boolean(r && me && r.reviewerId === me.id);
  const p = { params: { path: { id } } };

  const take = useMutation({
    mutationFn: () => api.POST('/admin/verification/requests/{id}/take', p),
    onSuccess: done,
    onError,
  });
  const approve = useMutation({
    mutationFn: () => api.POST('/admin/verification/requests/{id}/approve', p),
    onSuccess: done,
    onError,
  });
  const requestInfo = useMutation({
    mutationFn: async () => {
      const a = await ask({ title: 'Запросить информацию', label: 'Сообщение адвокату', max: 1000, confirm: 'Отправить' });
      if (!a) return null;
      return api.POST('/admin/verification/requests/{id}/request-info', { ...p, body: { message: a.text } });
    },
    onSuccess: (x) => x && done(),
    onError,
  });
  const reject = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Отклонить заявку',
        choices: REJECTION,
        choiceLabel: 'Код отказа',
        label: 'Комментарий (необязательно)',
        optionalText: true,
        max: 1000,
        confirm: 'Отклонить',
        danger: true,
      });
      if (!a) return null;
      return api.POST('/admin/verification/requests/{id}/reject', {
        ...p,
        body: { rejectionCode: a.choice as never, ...(a.text ? { comment: a.text } : {}) },
      });
    },
    onSuccess: (x) => x && done(),
    onError,
  });
  const decide = useMutation({
    mutationFn: async (v: { licenseId: string; decision: 'verified' | 'rejected' }) => {
      let body: { decision: 'verified' | 'rejected'; rejectionCode?: string; note?: string } = { decision: v.decision };
      if (v.decision === 'rejected') {
        const a = await ask({
          title: 'Отклонить лицензию',
          choices: REJECTION,
          choiceLabel: 'Код',
          label: 'Заметка (необязательно)',
          optionalText: true,
          max: 1000,
          confirm: 'Отклонить',
          danger: true,
        });
        if (!a) return null;
        body = { decision: 'rejected', rejectionCode: a.choice, ...(a.text ? { note: a.text } : {}) };
      }
      return api.POST('/admin/verification/requests/{id}/licenses/{licenseId}/decision', {
        params: { path: { id, licenseId: v.licenseId } },
        body: body as never,
      });
    },
    onSuccess: (x) => x && done(),
    onError,
  });
  const recheck = useMutation({
    mutationFn: (licenseId: string) =>
      api.POST('/admin/verification/licenses/{licenseId}/recheck', { params: { path: { licenseId } } }),
    onSuccess: done,
    onError,
  });
  const openDocument = useMutation({
    mutationFn: async (documentId: string) => {
      const a = await ask({
        title: 'Причина просмотра документа',
        description: 'Записывается в журнал аудита (docs/06 §2.1).',
        label: 'Причина',
        confirm: 'Открыть',
      });
      if (!a) return null;
      const res = await api.POST('/admin/verification/documents/{documentId}/url', {
        params: { path: { documentId }, header: { 'X-Justification': a.text } },
      });
      return res.data!.data.url;
    },
    onSuccess: (url) => {
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    },
    onError,
  });
  const attorneyStatus = useMutation({
    mutationFn: async (what: 'suspend' | 'restore') => {
      if (!r) return null;
      const path = { params: { path: { attorneyId: r.attorney.id } } };
      if (what === 'restore') return api.POST('/admin/verification/attorneys/{attorneyId}/restore', path);
      const a = await ask({ title: 'Приостановить адвоката', label: 'Причина', min: 3, confirm: 'Приостановить', danger: true });
      if (!a) return null;
      return api.POST('/admin/verification/attorneys/{attorneyId}/suspend', { ...path, body: { reason: a.text } });
    },
    onSuccess: (x) => x && done(),
    onError,
  });

  if (!r) {
    return (
      <>
        <PageHeader title="Заявка" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
      </>
    );
  }
  const name = [r.attorney.firstName, r.attorney.lastName].filter(Boolean).join(' ') || `@${r.attorney.username}`;
  const active = r.status === 'in_review' || r.status === 'submitted' || r.status === 'needs_more_info';
  const busy = take.isPending || approve.isPending || requestInfo.isPending || reject.isPending;

  return (
    <>
      {dialog}
      <PageHeader
        title={name}
        subtitle={`@${r.attorney.username} · заявка ${r.id} · ${REQUEST_STATUS[r.status] ?? r.status}`}
        actions={
          <>
            {r.status === 'submitted' || (r.status === 'needs_more_info' && !r.reviewerId) ? (
              <Button size="sm" disabled={busy} onClick={() => take.mutate()}>
                Взять в работу
              </Button>
            ) : null}
            {active && mine ? (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => requestInfo.mutate()}>
                  Запросить информацию
                </Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => reject.mutate()}>
                  Отклонить
                </Button>
                <Button size="sm" variant="gold" disabled={busy} onClick={() => approve.mutate()}>
                  Одобрить
                </Button>
              </>
            ) : null}
            {r.attorney.verificationStatus === 'suspended' ? (
              <Button size="sm" variant="outline" disabled={attorneyStatus.isPending} onClick={() => attorneyStatus.mutate('restore')}>
                Восстановить адвоката
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={attorneyStatus.isPending} onClick={() => attorneyStatus.mutate('suspend')}>
                Приостановить адвоката
              </Button>
            )}
          </>
        }
      />
      <ErrorNote text={error} />
      {active && r.reviewerId && !mine ? (
        <p className="mb-4 rounded-md bg-accent-soft px-3 py-2 text-sm text-gold-600">
          Заявку проверяет другой администратор ({r.reviewerId.slice(0, 8)}…).
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Заявка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Провайдер" v={r.provider} />
            <Row k="Подана" v={formatDateTime(r.submittedAt)} />
            <Row k="Рассмотрена" v={formatDateTime(r.reviewedAt)} />
            <Row k="Статус адвоката" v={<Badge>{r.attorney.verificationStatus}</Badge>} />
            {r.applicantComment ? <Row k="Комментарий" v={r.applicantComment} /> : null}
            {r.infoRequestMessage ? <Row k="Запрос" v={r.infoRequestMessage} /> : null}
            {r.rejectionCode ? <Row k="Отказ" v={`${r.rejectionCode}${r.rejectionReason ? ` — ${r.rejectionReason}` : ''}`} /> : null}
            {r.adminNote ? <Row k="Заметка" v={r.adminNote} /> : null}
            <Row k="Пользователь" v={<Link className="text-navy underline" href={`/users/${r.attorney.id}`}>карточка</Link>} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Документы</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line text-sm">
              {r.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <div>
                      {DOC_TYPE[d.docType] ?? d.docType}
                      {d.side ? ` (${d.side === 'front' ? 'лицевая' : 'оборот'})` : ''}
                      {d.stateCode ? ` · ${d.stateCode}` : ''}
                    </div>
                    <div className="text-xs text-muted">
                      {d.mime} · {(d.sizeBytes / 1024).toFixed(0)} KB · {formatDateTime(d.createdAt)}
                      {d.scanStatus !== 'clean' ? ` · антивирус: ${d.scanStatus}` : ''}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={openDocument.isPending || d.scanStatus !== 'clean'} onClick={() => openDocument.mutate(d.id)}>
                    Открыть
                  </Button>
                </li>
              ))}
              {r.documents.length === 0 ? <li className="py-2 text-muted">Нет документов</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted">Лицензии</h2>
        <Table>
          <thead>
            <tr>
              <Th>Штат</Th>
              <Th>Номер</Th>
              <Th>Статус</Th>
              <Th>Автопроверка</Th>
              <Th>Истекает</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {r.licenses.map((l) => (
              <tr key={l.id}>
                <Td>{l.stateCode} <span className="text-xs text-muted">{l.stateName}</span></Td>
                <Td className="font-mono text-xs">{l.barNumber}</Td>
                <Td>
                  <Badge tone={l.status === 'verified' ? 'success' : l.status === 'rejected' ? 'danger' : 'neutral'}>{l.status}</Badge>
                  {l.rejectionCode ? <div className="text-xs text-muted">{l.rejectionCode}{l.rejectionNote ? ` — ${l.rejectionNote}` : ''}</div> : null}
                </Td>
                <Td className="max-w-64 text-xs">
                  {l.autoCheckResult ? <pre className="max-h-24 overflow-auto rounded bg-canvas p-1">{JSON.stringify(l.autoCheckResult, null, 1)}</pre> : '—'}
                </Td>
                <Td className="whitespace-nowrap">{l.expiresAt ? formatDateTime(l.expiresAt) : '—'}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" disabled={recheck.isPending} onClick={() => recheck.mutate(l.id)}>
                      Перепроверить
                    </Button>
                    {active && mine ? (
                      <>
                        <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ licenseId: l.id, decision: 'verified' })}>
                          Подтвердить
                        </Button>
                        <Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ licenseId: l.id, decision: 'rejected' })}>
                          Отклонить
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Проверки</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {r.checks.length === 0 ? <p className="text-muted">Нет</p> : null}
            <ul className="space-y-2">
              {r.checks.map((c) => (
                <li key={c.id} className="rounded-md bg-canvas p-2">
                  <div className="flex justify-between">
                    <span>{c.checkType} · {c.provider}</span>
                    <Badge tone={c.result === 'pass' ? 'success' : c.result === 'fail' ? 'danger' : 'gold'}>{c.result}</Badge>
                  </div>
                  <div className="text-xs text-muted">{formatDateTime(c.checkedAt)}</div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted">детали</summary>
                    <pre className="mt-1 max-h-40 overflow-auto">{JSON.stringify(c.details, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Прошлые заявки</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {r.history.length === 0 ? <p className="text-muted">Нет</p> : null}
            <ul className="space-y-1">
              {r.history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <Link href={`/verification/${h.id}`} className="text-navy underline">
                    {formatDateTime(h.submittedAt ?? h.createdAt)}
                  </Link>
                  <span>
                    {REQUEST_STATUS[h.status] ?? h.status}
                    {h.rejectionCode ? ` · ${h.rejectionCode}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
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
