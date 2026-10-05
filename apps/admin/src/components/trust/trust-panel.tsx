'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import {
  BUSINESS_TYPE_RU,
  eventDetails,
  FIRM_LINK_SOURCE_RU,
  FIRM_LINK_STATUS_RU,
  GATE_REASON_RU,
  HOLD_RU,
  LICENSE_CONFIRMED_BY_RU,
  NAME_CHECK_RU,
  TRUST_ACTOR_RU,
  TRUST_EVENT_RU,
  TRUST_LEVEL_RU,
  TrustLevelChip,
} from '@/lib/trust-labels';
import { formatDateTime } from '@/lib/utils';

type Gate = components['schemas']['TrustGateDto'];

export const TRUST_NOTE_MAX = 500;

/** Query key of one attorney's trust card (invalidated after every action). */
export const trustCardKey = (attorneyId: string) => ['trust-card', attorneyId] as const;

/**
 * Owner 2026-10-05 — the trust block of an attorney's card (docs/ATTORNEY_TRUST.md):
 * level and the facts behind it, holds, Stripe identity, history, and the
 * verifier's actions over GET/POST /admin/trust/attorneys/:id/*. Writes need
 * `verification: manage`; the API answers 403 otherwise.
 */
export function TrustPanel({ attorneyId }: { attorneyId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canManage = me ? can(me, 'verification', 'manage') : false;
  const { ask, dialog } = useReason();
  const { confirm, dialog: confirmDialog } = useConfirm();
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
    void qc.invalidateQueries({ queryKey: trustCardKey(attorneyId) });
    void qc.invalidateQueries({ queryKey: ['trust-holds'] });
    void qc.invalidateQueries({ queryKey: ['trust-stats'] });
    void qc.invalidateQueries({ queryKey: ['verification', c?.latestRequestId] });
  };
  const noteBody = (text: string) => (text ? { note: text } : {});

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
        description: 'Уровень пересчитается; если реестр штата номер не подтверждал, адвокат вернётся на уровень 0.',
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
  const confirmDocuments = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Подтвердить документы',
        description: 'Вы сверили карточку адвоката, удостоверение личности и селфи с профилем.',
        label: 'Заметка (необязательно)',
        optionalText: true,
        max: TRUST_NOTE_MAX,
        confirm: 'Подтвердить',
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/confirm-documents', { ...p, body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Документы подтверждены'),
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
      api.POST('/admin/trust/attorneys/{attorneyId}/hold', {
        ...p,
        body: { payments: v.payments, bids: v.bids, ...noteBody(v.note) },
      }),
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
        title: 'Пересчитать уровень?',
        description: 'Уровень будет вычислен заново из фактов: реестр, Stripe, документы, холды.',
        confirm: 'Пересчитать',
      });
      if (!ok) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/recompute', p);
    },
    onSuccess: (x) => x && done('Уровень пересчитан'),
    onError,
  });

  if (q.isPending) return <Skeleton className="h-56 rounded-[var(--radius-lg)]" />;
  if (!c) return <ErrorNote text={q.error ? errorText(q.error) : 'Не удалось загрузить уровень доверия'} />;

  const s = c.signals;
  const held = Boolean(c.holds.payments || c.holds.bids);
  const busy =
    confirmLicense.isPending ||
    unconfirmLicense.isPending ||
    confirmDocuments.isPending ||
    confirmFirmLink.isPending ||
    release.isPending ||
    recompute.isPending;
  const staffLicense = s.licenseConfirmed && s.licenseConfirmedBy === 'staff';

  return (
    <>
      {dialog}
      {confirmDialog}
      <HoldDialog
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        pending={hold.isPending}
        current={c.holds}
        onSubmit={(v) => hold.mutate(v)}
      />
      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>Уровень доверия</CardTitle>
          <div className="flex items-center gap-2">
            <TrustLevelChip level={c.level} long />
            <Badge tone={c.badge ? 'info' : 'neutral'}>{c.badge ? 'Галочка показана' : 'Без галочки'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <p className="text-xs text-muted">{TRUST_LEVEL_RU[c.level]?.hint}</p>

          {canManage ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {staffLicense ? (
                <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => unconfirmLicense.mutate()}>
                  Снять подтверждение
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
              <Button size="sm" variant="outline" className="w-full" disabled={busy || s.documentsVerified} onClick={() => confirmDocuments.mutate()}>
                Подтвердить документы
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={busy || c.firmLink.status === 'confirmed'}
                onClick={() => confirmFirmLink.mutate()}
              >
                Подтвердить связь с фирмой
              </Button>
              <Button size="sm" variant="danger-soft" className="w-full" disabled={busy} onClick={() => setHoldOpen(true)}>
                Поставить холд
              </Button>
              <Button size="sm" variant="soft" className="w-full" disabled={busy || !held} onClick={() => release.mutate()}>
                Снять холд
              </Button>
              <Button size="sm" variant="ghost" className="w-full" disabled={busy} onClick={() => recompute.mutate()}>
                Пересчитать
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
                  extra={s.licenseConfirmedBy ? LICENSE_CONFIRMED_BY_RU[s.licenseConfirmedBy] ?? s.licenseConfirmedBy : undefined}
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
                <Row k="Тип аккаунта" v={c.stripeBusinessType ? BUSINESS_TYPE_RU[c.stripeBusinessType] ?? c.stripeBusinessType : '—'} />
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
                <Row k="Жалоб (мошенничество / самозванец)" v={<span className={c.complaintsTotal > 0 ? 'font-medium text-warning' : ''}>{c.complaintsTotal}</span>} />
                <Row k="Чужих заявок на этот номер" v={<span className={c.duplicateClaims > 0 ? 'font-medium text-warning' : ''}>{c.duplicateClaims}</span>} />
              </ul>
              {c.registryLinks.length ? (
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
              {gate.reason ? GATE_REASON_RU[gate.reason] ?? gate.reason : ''}
              {gate.reason === 'level' ? ` (нужен ${gate.required}, есть ${gate.current})` : ''}
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
