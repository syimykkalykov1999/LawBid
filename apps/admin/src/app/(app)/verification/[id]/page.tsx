'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileText } from '@phosphor-icons/react';
import { useConfirm } from '@/components/legacy/confirm';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { canOpen } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import {
  CHECK_RESULT,
  CHECK_TYPE,
  DOC_TYPE,
  label,
  LICENSE_STATUS,
  REJECTION_CODE,
  REQUEST_STATUS,
  StatusPill,
  VERIFICATION_PROVIDER,
  VERIFICATION_STATUS,
} from '@/lib/labels';

const REJECTION = Object.entries(REJECTION_CODE).map(([value, l]) => ({ value, label: l }));
const SCAN_STATUS: Record<string, string> = {
  pending: 'проверяется',
  clean: 'чисто',
  infected: 'найден вирус',
  failed: 'ошибка проверки',
};

/** docs/06 §2.3 item 2 — the request card over the file-03 §2.5 API:
 * take → per-license decisions (with re-check) → approve / request info /
 * reject; documents open by signed link after a justification. */
export default function VerificationCardPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { ask, dialog } = useReason();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['verification', id],
    queryFn: async () =>
      (await api.GET('/admin/verification/requests/{id}', { params: { path: { id } } })).data!.data,
  });
  const r = q.data;
  const onError = (e: unknown) => toast.error(e);
  /** After any change: the card, the queue list and the sidebar counter. */
  const done = (text: string) => {
    toast.success(text);
    void qc.invalidateQueries({ queryKey: ['verification', id] });
    void qc.invalidateQueries({ queryKey: ['verification-queue'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const mine = Boolean(r && me && r.reviewerId === me.id);
  const p = { params: { path: { id } } };

  const take = useMutation({
    mutationFn: () => api.POST('/admin/verification/requests/{id}/take', p),
    onSuccess: () => done('Заявка взята в работу'),
    onError,
  });
  const approve = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Одобрить заявку?',
        description: 'Адвокат получит статус «верифицирован» и уведомление.',
        confirm: 'Одобрить',
      });
      if (!ok) return null;
      return api.POST('/admin/verification/requests/{id}/approve', p);
    },
    onSuccess: (x) => x && done('Заявка одобрена'),
    onError,
  });
  const requestInfo = useMutation({
    mutationFn: async () => {
      const a = await ask({ title: 'Запросить информацию', label: 'Сообщение адвокату', max: 1000, confirm: 'Отправить' });
      if (!a) return null;
      return api.POST('/admin/verification/requests/{id}/request-info', { ...p, body: { message: a.text } });
    },
    onSuccess: (x) => x && done('Запрос отправлен адвокату'),
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
    onSuccess: (x) => x && done('Заявка отклонена'),
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
    onSuccess: (x) => x && done('Решение по лицензии сохранено'),
    onError,
  });
  const recheck = useMutation({
    mutationFn: (licenseId: string) =>
      api.POST('/admin/verification/licenses/{licenseId}/recheck', { params: { path: { licenseId } } }),
    onSuccess: () => done('Перепроверка запущена'),
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
        params: { path: { documentId }, header: { 'X-Justification': encodeURIComponent(a.text) } },
      });
      return res.data!.data.url;
    },
    onSuccess: (url) => {
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success('Документ открыт, просмотр записан в журнал');
      }
    },
    onError,
  });
  const attorneyStatus = useMutation({
    mutationFn: async (what: 'suspend' | 'restore') => {
      if (!r) return null;
      const path = { params: { path: { attorneyId: r.attorney.id } } };
      if (what === 'restore') {
        const ok = await confirm({ title: 'Восстановить адвоката?', confirm: 'Восстановить' });
        if (!ok) return null;
        await api.POST('/admin/verification/attorneys/{attorneyId}/restore', path);
        return 'Адвокат восстановлен';
      }
      const a = await ask({ title: 'Приостановить адвоката', label: 'Причина', min: 3, confirm: 'Приостановить', danger: true });
      if (!a) return null;
      await api.POST('/admin/verification/attorneys/{attorneyId}/suspend', { ...path, body: { reason: a.text } });
      return 'Адвокат приостановлен';
    },
    onSuccess: (x) => x && done(x),
    onError,
  });

  if (!r) {
    return (
      <>
        <PageHeader eyebrow="Люди · Верификация" title="Заявка" />
        <ErrorNote text={q.error ? errorText(q.error) : null} />
        {q.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-[var(--radius-lg)]" />
            <Skeleton className="h-72 rounded-[var(--radius-lg)] lg:col-span-2" />
          </div>
        ) : null}
      </>
    );
  }
  const name = [r.attorney.firstName, r.attorney.lastName].filter(Boolean).join(' ') || `@${r.attorney.username}`;
  const active = r.status === 'in_review' || r.status === 'submitted' || r.status === 'needs_more_info';
  const busy = take.isPending || approve.isPending || requestInfo.isPending || reject.isPending;
  const canSeeUser = canOpen(me?.role, '/users');

  return (
    <>
      {dialog}
      {confirmDialog}
      <PageHeader
        eyebrow="Люди · Верификация"
        title={name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            @{r.attorney.username} · заявка <span className="font-mono text-xs">{r.id}</span>
            <StatusPill map={REQUEST_STATUS} value={r.status} />
          </span>
        }
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
      {active && r.reviewerId && !mine ? (
        <p className="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm text-gold-600">
          Заявку проверяет другой администратор ({r.reviewerId.slice(0, 8)}…).
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn i={0}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Заявка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Провайдер" v={label(VERIFICATION_PROVIDER, r.provider)} />
            <Row k="Подана" v={formatDateTime(r.submittedAt)} />
            <Row k="Рассмотрена" v={formatDateTime(r.reviewedAt)} />
            <Row k="Статус адвоката" v={<StatusPill map={VERIFICATION_STATUS} value={r.attorney.verificationStatus} />} />
            {r.applicantComment ? <Row k="Комментарий" v={r.applicantComment} /> : null}
            {r.infoRequestMessage ? <Row k="Запрос" v={r.infoRequestMessage} /> : null}
            {r.rejectionCode ? <Row k="Отказ" v={`${label(REJECTION_CODE, r.rejectionCode)}${r.rejectionReason ? ` — ${r.rejectionReason}` : ''}`} /> : null}
            {r.adminNote ? <Row k="Заметка" v={r.adminNote} /> : null}
            {canSeeUser ? (
              <Row k="Пользователь" v={<Link className="text-gold-600 hover:underline" href={`/users/${r.attorney.id}`}>карточка</Link>} />
            ) : null}
          </CardContent>
        </Card>
        </FadeIn>
        <FadeIn i={1} className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Документы</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line text-sm">
              {r.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <FileText size={18} weight="light" className="mt-0.5 shrink-0 text-faint" />
                    <div>
                    <div className="text-ink">
                      {DOC_TYPE[d.docType] ?? d.docType}
                      {d.side ? ` (${d.side === 'front' ? 'лицевая' : 'оборот'})` : ''}
                      {d.stateCode ? ` · ${d.stateCode}` : ''}
                    </div>
                    <div className="text-xs text-muted">
                      {d.mime} · {(d.sizeBytes / 1024).toFixed(0)} KB · {formatDateTime(d.createdAt)}
                      {d.scanStatus !== 'clean' ? ` · антивирус: ${label(SCAN_STATUS, d.scanStatus)}` : ''}
                    </div>
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
        </FadeIn>
      </div>
      <section>
        <SectionTitle>Лицензии</SectionTitle>
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
            {r.licenses.length === 0 ? <TableEmpty colSpan={6}>Лицензий в заявке нет</TableEmpty> : null}
            {r.licenses.map((l, i) => (
              <MotionRow key={l.id} i={i}>
                <Td>{l.stateCode} <span className="text-xs text-muted">{l.stateName}</span></Td>
                <Td className="font-mono text-xs">{l.barNumber}</Td>
                <Td>
                  <StatusPill map={LICENSE_STATUS} value={l.status} />
                  {l.rejectionCode ? <div className="mt-1 text-xs text-muted">{label(REJECTION_CODE, l.rejectionCode)}{l.rejectionNote ? ` — ${l.rejectionNote}` : ''}</div> : null}
                </Td>
                <Td className="max-w-64 text-xs">
                  {l.autoCheckResult ? <pre className="max-h-24 overflow-auto rounded-lg bg-surface-2 p-1.5">{JSON.stringify(l.autoCheckResult, null, 1)}</pre> : '—'}
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
              </MotionRow>
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
                <li key={c.id} className="rounded-xl bg-surface-2 p-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-ink">
                      {label(CHECK_TYPE, c.checkType)} · {label(VERIFICATION_PROVIDER, c.provider)}
                    </span>
                    <StatusPill map={CHECK_RESULT} value={c.result} />
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
                  <Link href={`/verification/${h.id}`} className="text-gold-600 hover:underline">
                    {formatDateTime(h.submittedAt ?? h.createdAt)}
                  </Link>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusPill map={REQUEST_STATUS} value={h.status} />
                    {h.rejectionCode ? <span className="text-xs text-muted">{label(REJECTION_CODE, h.rejectionCode)}</span> : null}
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
