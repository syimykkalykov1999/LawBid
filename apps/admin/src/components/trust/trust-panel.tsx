'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { BarLookups, BlockedChip } from '@/components/trust/bar-lookups';
import { TRUST_NOTE_MAX, useDocumentRequest } from '@/components/trust/document-request-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { DOC_TYPE } from '@/lib/labels';
import { can, ROLE_LABEL, type AdminRole } from '@/lib/rbac';
import {
  BadgeStatusChip,
  BUSINESS_TYPE_RU,
  CLEARED_BY_RU,
  DOC_TEMPLATE_RU,
  documentsSeenText,
  eventDetails,
  FIRM_LINK_SOURCE_RU,
  FIRM_LINK_STATUS_RU,
  GATE_REASON_RU,
  HOLD_RU,
  LICENSE_CONFIRMED_BY_RU,
  missingText,
  NAME_CHECK_RU,
  QUEUE_REASON_RU,
  REQUIREMENT_RU,
  REQUIREMENTS,
  STAFF_STATUS_RU,
  staffName,
  TRUST_ACTOR_RU,
  TRUST_EVENT_RU,
  TrustLevelChip,
  type DocTemplate,
} from '@/lib/trust-labels';
import { formatDateTime } from '@/lib/utils';

type Gate = components['schemas']['TrustGateDto'];

export { TRUST_NOTE_MAX };

/** Query key of one attorney's trust card (invalidated after every action). */
export const trustCardKey = (attorneyId: string) => ['trust-card', attorneyId] as const;

/** Every list the trust actions change. */
export function invalidateTrust(qc: ReturnType<typeof useQueryClient>, attorneyId?: string) {
  if (attorneyId) void qc.invalidateQueries({ queryKey: trustCardKey(attorneyId) });
  else void qc.invalidateQueries({ queryKey: ['trust-card'] });
  void qc.invalidateQueries({ queryKey: ['trust-queue'] });
  void qc.invalidateQueries({ queryKey: ['trust-holds'] });
  void qc.invalidateQueries({ queryKey: ['trust-stats'] });
}

/**
 * Owner 2026-10-05 — «Борьба с мошенниками» block of an attorney's card:
 * status, requirements, why they wait in the queue, the facts behind it,
 * holds, Stripe identity, history and the verifier's actions over
 * /admin/trust/attorneys/:id/*. Writes need `verification: manage`.
 */
export function TrustPanel({ attorneyId }: { attorneyId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canManage = me ? can(me, 'verification', 'manage') : false;
  const { ask, dialog } = useReason();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { askDocuments, dialog: docDialog } = useDocumentRequest();
  const [holdOpen, setHoldOpen] = useState(false);

  const q = useQuery({
    queryKey: trustCardKey(attorneyId),
    queryFn: async () =>
      (await api.GET('/admin/trust/attorneys/{attorneyId}', { params: { path: { attorneyId } } })).data!.data,
  });
  const c = q.data;
  const p = { params: { path: { attorneyId } } };
  const onError = (e: unknown) => toast.error(e);
  const done = (text: string) => {
    toast.success(text);
    invalidateTrust(qc, attorneyId);
    void qc.invalidateQueries({ queryKey: ['verification', c?.latestRequestId] });
    void qc.invalidateQueries({ queryKey: ['verification-queue'] });
  };
  const noteBody = (text: string) => (text ? { note: text } : {});

  const clear = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Подтвердить адвоката',
        description: 'Вы ручаетесь: галочка и приём денег открываются насовсем, автоматические перепроверки больше не ставят его в очередь.',
        label: 'Что проверили (необязательно)',
        optionalText: true,
        max: TRUST_NOTE_MAX,
        confirm: 'Подтвердить',
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/clear', { ...p, body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Адвокат подтверждён'),
    onError,
  });
  const unclear = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Снять подтверждение',
        description: 'Адвокат снова проходит требования как все; если что-то не пройдено — попадёт в очередь.',
        label: 'Причина',
        min: 3,
        max: TRUST_NOTE_MAX,
        confirm: 'Снять',
        danger: true,
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/unclear', { ...p, body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Подтверждение снято'),
    onError,
  });
  const requestDocuments = useMutation({
    mutationFn: async () => {
      const r = await askDocuments();
      if (!r) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/request-documents', {
        ...p,
        body: { template: r.template as DocTemplate, ...noteBody(r.note) },
      });
    },
    onSuccess: (x) => x && done('Запрос документов отправлен адвокату'),
    onError,
  });
  const reject = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Отклонить адвоката',
        description: 'Аккаунт приостанавливается, активные ставки отзываются. Адвокат получит уведомление с вашей заметкой.',
        label: 'Причина',
        min: 3,
        max: TRUST_NOTE_MAX,
        confirm: 'Отклонить',
        danger: true,
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/reject', { ...p, body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Адвокат отклонён'),
    onError,
  });
  const confirmLicense = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Подтвердить лицензию',
        description: 'Вы открыли страницу коллегии штата и увидели действующую лицензию с этим номером и именем.',
        label: 'Заметка (необязательно)',
        optionalText: true,
        max: TRUST_NOTE_MAX,
        confirm: 'Подтвердить',
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/confirm-license', { ...p, body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Лицензия подтверждена'),
    onError,
  });
  const unconfirmLicense = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Снять подтверждение лицензии',
        description: 'Требование «Реестр» снова считается не пройденным, если реестр штата номер не подтверждал.',
        label: 'Причина',
        min: 3,
        max: TRUST_NOTE_MAX,
        confirm: 'Снять',
        danger: true,
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/unconfirm-license', { ...p, body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Подтверждение лицензии снято'),
    onError,
  });
  const confirmFirmLink = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Подтвердить связь с фирмой',
        description: 'Вы видели письмо на бланке фирмы или иное подтверждение, что адвокат работает в компании из Stripe.',
        label: 'Что вы проверили',
        min: 3,
        max: TRUST_NOTE_MAX,
        confirm: 'Подтвердить',
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/confirm-firm-link', { ...p, body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Связь с фирмой подтверждена'),
    onError,
  });
  const hold = useMutation({
    mutationFn: (v: { payments: boolean; bids: boolean; note: string }) =>
      api.POST('/admin/trust/attorneys/{attorneyId}/hold', { ...p, body: { payments: v.payments, bids: v.bids, ...noteBody(v.note) } }),
    onSuccess: () => {
      setHoldOpen(false);
      done('Холд поставлен');
    },
    onError,
  });
  const release = useMutation({
    mutationFn: async () => {
      if (!c) return null;
      const a = await ask({
        title: 'Снять холд',
        description: 'Платежи и ставки возобновятся, адвокат получит уведомление.',
        label: 'Что проверили (необязательно)',
        optionalText: true,
        max: TRUST_NOTE_MAX,
        confirm: 'Снять холд',
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/release', {
        ...p,
        body: { payments: Boolean(c.holds.payments), bids: Boolean(c.holds.bids), ...noteBody(a.text) },
      });
    },
    onSuccess: (x) => x && done('Холд снят'),
    onError,
  });
  const recompute = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Пересчитать?',
        description: 'Статус будет вычислен заново из фактов: реестр, Stripe, документы, холды.',
        confirm: 'Пересчитать',
      });
      if (!ok) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/recompute', p);
    },
    onSuccess: (x) => x && done('Пересчитано'),
    onError,
  });

  if (q.isPending) return <Skeleton className="h-56 rounded-[var(--radius-lg)]" />;
  if (!c) return <ErrorNote text={q.error ? errorText(q.error) : 'Не удалось загрузить проверку адвоката'} />;

  const s = c.signals;
  const held = Boolean(c.holds.payments || c.holds.bids);
  const busy =
    clear.isPending ||
    unclear.isPending ||
    requestDocuments.isPending ||
    reject.isPending ||
    confirmLicense.isPending ||
    unconfirmLicense.isPending ||
    confirmFirmLink.isPending ||
    release.isPending ||
    recompute.isPending;
  const staffLicense = s.licenseConfirmed && s.licenseConfirmedBy === 'staff';
  const staffCleared = c.cleared && c.clearedBy === 'staff';
  const status = STAFF_STATUS_RU[c.staffStatus] ?? { text: c.staffStatus, tone: 'neutral' as const };

  return (
    <>
      {dialog}
      {confirmDialog}
      {docDialog}
      <HoldDialog open={holdOpen} onClose={() => setHoldOpen(false)} pending={hold.isPending} current={c.holds} onSubmit={(v) => hold.mutate(v)} />
      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>Борьба с мошенниками</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <BadgeStatusChip status={c.badgeStatus} />
            <Badge tone={status.tone} dot>
              {status.text}
            </Badge>
            <TrustLevelChip level={c.level} />
            <Badge tone={c.badge ? 'info' : 'neutral'}>{c.badge ? 'Галочка показана' : 'Без галочки'}</Badge>
            {c.blocked ? <BlockedChip /> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Статус</h4>
              <ul className="space-y-1.5">
                <Row k="Статус" v={<Badge tone={status.tone} dot>{status.text}</Badge>} />
                {c.cleared ? (
                  <Row
                    k="Подтверждён"
                    v={`${CLEARED_BY_RU[c.clearedBy ?? ''] ?? c.clearedBy ?? '—'}${c.staffClearedAt ? ` · ${formatDateTime(c.staffClearedAt)}` : ''}`}
                  />
                ) : null}
                {c.staffClearedBy && c.staffStatus !== 'suspended' ? (
                  <Row
                    k="Одобрил"
                    v={`${staffName(c.staffClearedBy)}${c.staffClearedBy.role ? ` (${ROLE_LABEL[c.staffClearedBy.role as AdminRole] ?? c.staffClearedBy.role})` : ''}${c.staffClearedAt ? `, ${formatDateTime(c.staffClearedAt)}` : ''}`}
                  />
                ) : null}
                {c.staffClearedBy && c.staffStatus === 'suspended' ? (
                  <li className="rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">
                    Был одобрен: {staffName(c.staffClearedBy)}
                    {c.staffClearedBy.role ? ` (${ROLE_LABEL[c.staffClearedBy.role as AdminRole] ?? c.staffClearedBy.role})` : ''}
                    {c.staffClearedAt ? `, ${formatDateTime(c.staffClearedAt)}` : ''}
                    {c.staffClearedBy.email ? ` · ${c.staffClearedBy.email}` : ''}
                  </li>
                ) : null}
                {c.queueReasons.length ? (
                  <li className="flex items-start justify-between gap-3">
                    <span className="text-muted">В очереди, потому что</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {c.queueReasons.map((r) => (
                        <Badge key={r} tone={QUEUE_REASON_RU[r]?.tone ?? 'neutral'}>
                          {QUEUE_REASON_RU[r]?.text ?? r}
                        </Badge>
                      ))}
                    </span>
                  </li>
                ) : null}
                {c.documentsRequestedAt ? (
                  <Row
                    k="Запрошены документы"
                    v={`${formatDateTime(c.documentsRequestedAt)}${c.documentsRequestedTemplate ? ` · ${DOC_TEMPLATE_RU[c.documentsRequestedTemplate as DocTemplate] ?? c.documentsRequestedTemplate}` : ''}`}
                  />
                ) : null}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Требования</h4>
              <ul className="space-y-1.5">
                {REQUIREMENTS.map((r) => {
                  const passed = c.requirements[r];
                  const required = c.missing.includes(r) || passed;
                  return (
                    <li key={r} className="flex items-center justify-between gap-3">
                      <span className="text-muted" title={REQUIREMENT_RU[r].hint}>
                        {REQUIREMENT_RU[r].text}
                      </span>
                      <Badge tone={passed ? 'success' : c.missing.includes(r) ? 'warning' : 'neutral'}>
                        {passed ? '✓ пройдено' : c.missing.includes(r) ? 'не пройдено' : required ? '—' : 'не требуется'}
                      </Badge>
                    </li>
                  );
                })}
                {c.missing.length ? <li className="text-xs text-muted">Не хватает: {missingText(c.missing)}</li> : null}
              </ul>
            </div>
          </div>

          {canManage ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {staffCleared ? (
                <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => unclear.mutate()}>
                  Снять подтверждение
                </Button>
              ) : (
                <Button size="sm" variant="gold" className="w-full" disabled={busy || c.cleared} onClick={() => clear.mutate()}>
                  Подтвердить
                </Button>
              )}
              <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => requestDocuments.mutate()}>
                Запросить ещё
              </Button>
              <Button size="sm" variant="danger" className="w-full" disabled={busy || c.staffStatus === 'suspended'} onClick={() => reject.mutate()}>
                Отклонить
              </Button>
              <Button size="sm" variant="ghost" className="w-full" disabled={busy} onClick={() => recompute.mutate()}>
                Пересчитать
              </Button>
              {staffLicense ? (
                <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => unconfirmLicense.mutate()}>
                  Снять подтверждение лицензии
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={busy || s.licenseConfirmed}
                  title={s.licenseConfirmed ? 'Уже подтверждена реестром штата' : undefined}
                  onClick={() => confirmLicense.mutate()}
                >
                  Подтвердить лицензию
                </Button>
              )}
              <Button size="sm" variant="outline" className="w-full" disabled={busy || c.firmLink.status === 'confirmed'} onClick={() => confirmFirmLink.mutate()}>
                Подтвердить связь с фирмой
              </Button>
              <Button size="sm" variant="danger-soft" className="w-full" disabled={busy} onClick={() => setHoldOpen(true)}>
                Поставить холд
              </Button>
              <Button size="sm" variant="soft" className="w-full" disabled={busy || !held} onClick={() => release.mutate()}>
                Снять холд
              </Button>
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Сигналы</h4>
              <ul className="space-y-1.5">
                <Signal ok={s.selfAttested} text="Присяга и заявленная лицензия" />
                <Signal
                  ok={s.licenseConfirmed}
                  text="Лицензия подтверждена"
                  extra={s.licenseConfirmedBy ? (LICENSE_CONFIRMED_BY_RU[s.licenseConfirmedBy] ?? s.licenseConfirmedBy) : undefined}
                />
                <Signal ok={s.documentsVerified} text="Документы проверены сотрудником" />
                <Signal ok={s.stripeKyc} text="Stripe KYC завершён" />
                <Signal ok={s.stripeIdentity} text="Личность по Stripe (имя совпало)" />
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted">Сверка имени</span>
                  <Badge tone={NAME_CHECK_RU[s.nameCheck]?.tone ?? 'neutral'}>{NAME_CHECK_RU[s.nameCheck]?.text ?? s.nameCheck}</Badge>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted">Связь с фирмой</span>
                  <span className="text-right">
                    <Badge tone={FIRM_LINK_STATUS_RU[c.firmLink.status]?.tone ?? 'neutral'}>
                      {FIRM_LINK_STATUS_RU[c.firmLink.status]?.text ?? c.firmLink.status}
                    </Badge>
                    {c.firmLink.source ? (
                      <div className="mt-0.5 text-xs text-muted">
                        {FIRM_LINK_SOURCE_RU[c.firmLink.source] ?? c.firmLink.source}
                        {c.firmLink.emailDomain ? ` · ${c.firmLink.emailDomain}` : ''}
                        {c.firmLink.at ? ` · ${formatDateTime(c.firmLink.at)}` : ''}
                      </div>
                    ) : null}
                  </span>
                </li>
                {c.firmLinkNote ? <li className="text-xs text-muted">Заметка о фирме: {c.firmLinkNote}</li> : null}
              </ul>
            </section>

            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Stripe</h4>
              <ul className="space-y-1.5">
                <Row k="Тип аккаунта" v={c.stripeBusinessType ? (BUSINESS_TYPE_RU[c.stripeBusinessType] ?? c.stripeBusinessType) : '—'} />
                <Row k="Юридическое имя" v={c.stripeLegalName ?? '—'} />
                <Row k="Компания" v={c.stripeCompanyName ?? '—'} />
                <Row k="Домен компании" v={c.stripeCompanyDomain ?? '—'} />
                <Row k="Представитель" v={c.stripeRepresentative ?? '—'} />
                <Row
                  k="Сравнение с профилем"
                  v={<Badge tone={NAME_CHECK_RU[s.nameCheck]?.tone ?? 'neutral'}>{NAME_CHECK_RU[s.nameCheck]?.text ?? s.nameCheck}</Badge>}
                />
                <Row k="Задержка выплат" v={c.payoutDelayDays == null ? 'по умолчанию Stripe' : `${c.payoutDelayDays} дн.`} />
              </ul>
            </section>

            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Холды и доступ</h4>
              <ul className="space-y-1.5">
                <HoldRow what="Платежи" code={c.holds.payments} at={c.holds.paymentsAt} gate={c.paymentsGate} />
                <HoldRow what="Ставки" code={c.holds.bids} at={c.holds.bidsAt} gate={c.bidsGate} />
                {c.holds.note ? <li className="text-xs text-muted">Заметка: {c.holds.note}</li> : null}
                <Row
                  k="Жалоб (мошенничество / самозванец)"
                  v={<span className={c.complaintsTotal > 0 ? 'font-medium text-warning' : ''}>{c.complaintsTotal}</span>}
                />
                <Row k="Чужих заявок на этот номер" v={<span className={c.duplicateClaims > 0 ? 'font-medium text-warning' : ''}>{c.duplicateClaims}</span>} />
              </ul>
              {c.lookups.length ? (
                <BarLookups lookups={c.lookups} className="mt-2" />
              ) : c.registryLinks.length ? (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {c.registryLinks.map((l) =>
                    l.url ? (
                      <a key={l.stateCode} href={l.url} target="_blank" rel="noreferrer" className="text-primary underline">
                        Реестр {l.stateCode}
                      </a>
                    ) : (
                      <span key={l.stateCode} className="text-muted">
                        {l.stateCode}: ссылки нет
                      </span>
                    ),
                  )}
                </div>
              ) : null}
            </section>

            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Последние события</h4>
              {c.events.length === 0 ? <p className="text-muted">Нет</p> : null}
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {c.events.map((e) => (
                  <li key={e.id} className="rounded-xl bg-surface-2 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-ink">
                        {TRUST_EVENT_RU[e.kind] ?? e.kind}
                        {e.fromLevel != null || e.toLevel != null ? (
                          <span className="ml-1.5 font-mono text-xs text-muted">
                            {e.fromLevel ?? '—'} → {e.toLevel ?? '—'}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-faint">{formatDateTime(e.createdAt)}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {TRUST_ACTOR_RU[e.actorType] ?? e.actorType}
                      {e.actorId ? ` ${e.actorId.slice(0, 8)}…` : ''}
                      {eventDetails(e.details) ? ` · ${eventDetails(e.details)}` : ''}
                    </div>
                    {typeof e.details.ip === 'string' || documentsSeenText(e.details, DOC_TYPE) ? (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-faint">
                        {typeof e.details.ip === 'string' ? <span>IP {e.details.ip}</span> : null}
                        {documentsSeenText(e.details, DOC_TYPE) ? <span className="font-sans">видел: {documentsSeenText(e.details, DOC_TYPE)}</span> : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Signal({ ok, text, extra }: { ok: boolean; text: string; extra?: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-muted">{text}</span>
      <span className="text-right">
        <Badge tone={ok ? 'success' : 'neutral'}>{ok ? 'да' : 'нет'}</Badge>
        {extra ? <div className="mt-0.5 text-xs text-muted">{extra}</div> : null}
      </span>
    </li>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="text-right break-words">{v}</span>
    </li>
  );
}

function HoldRow({ what, code, at, gate }: { what: string; code: string | null; at: string | null; gate: Gate }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="text-muted">{what}</span>
      <span className="text-right">
        {code ? (
          <>
            <Badge tone="danger" dot>
              {HOLD_RU[code] ?? code}
            </Badge>
            <div className="mt-0.5 text-xs text-muted">с {formatDateTime(at)}</div>
          </>
        ) : gate.ok ? (
          <Badge tone="success">открыты</Badge>
        ) : (
          <>
            <Badge tone="warning">закрыты</Badge>
            <div className="mt-0.5 text-xs text-muted">
              {gate.reason ? (GATE_REASON_RU[gate.reason] ?? gate.reason) : ''}
              {gate.reason === 'requirements' && gate.missing.length ? `: ${missingText(gate.missing)}` : ''}
            </div>
          </>
        )}
      </span>
    </li>
  );
}

/** «Поставить холд»: what to pause (payments / bids) and a note for the attorney. */
function HoldDialog({
  open,
  onClose,
  pending,
  current,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  current: components['schemas']['TrustHoldsDto'];
  onSubmit: (v: { payments: boolean; bids: boolean; note: string }) => void;
}) {
  const [payments, setPayments] = useState(true);
  const [bids, setBids] = useState(false);
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const ok = (payments || bids) && trimmed.length <= TRUST_NOTE_MAX;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Подтверждение"
      title="Поставить холд"
      description="Выбранное приостанавливается до снятия холда; адвокат получит уведомление с вашей заметкой."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !pending) onSubmit({ payments, bids, note: trimmed });
        }}
      >
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-gold" checked={payments} onChange={(e) => setPayments(e.target.checked)} />
            Платежи
            {current.payments ? <span className="text-xs text-muted">(уже на холде: {HOLD_RU[current.payments] ?? current.payments})</span> : null}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-gold" checked={bids} onChange={(e) => setBids(e.target.checked)} />
            Ставки и чат
            {current.bids ? <span className="text-xs text-muted">(уже на холде: {HOLD_RU[current.bids] ?? current.bids})</span> : null}
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hold-note">Заметка (необязательно)</Label>
          <Textarea id="hold-note" rows={3} maxLength={TRUST_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="text-right text-xs text-faint">
            {trimmed.length}/{TRUST_NOTE_MAX}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="danger" disabled={!ok} loading={pending}>
            Поставить холд
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
