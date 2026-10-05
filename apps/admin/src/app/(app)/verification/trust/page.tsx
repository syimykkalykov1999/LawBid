'use client';

import { HandPalm, Hourglass, SealCheck, Warning } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { AttorneysList } from '@/components/trust/attorneys-list';
import { BarLookups, BlockedChip } from '@/components/trust/bar-lookups';
import { BlockedBarNumbers } from '@/components/trust/blocked-bar-numbers';
import { BulkBar, PageSelectBox, RowSelectBox, useSelection } from '@/components/bulk/bulk-controls';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { TRUST_NOTE_MAX, useDocumentRequest } from '@/components/trust/document-request-dialog';
import { StaffDecisions } from '@/components/trust/staff-decisions';
import { invalidateTrust } from '@/components/trust/trust-panel';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { trustStatsQuery } from '@/lib/live';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import {
  attorneyName,
  BadgeStatusChip,
  BUSINESS_TYPE_RU,
  HOLD_RU,
  missingText,
  QUEUE_REASON_RU,
  QUEUE_REASONS,
  TRUST_LEVEL_RU,
  TrustLevelChip,
  type DocTemplate,
  type QueueReason,
} from '@/lib/trust-labels';
import { cn, formatDateTime, formatDuration } from '@/lib/utils';

type Settings = components['schemas']['TrustSettingsDto'];
type QueueItem = components['schemas']['TrustQueueItemDto'];
type Stats = components['schemas']['TrustStatsDto'];
type Preset = components['schemas']['TrustPresetDto']['preset'];
type Tab = 'attorneys' | 'queue' | 'rules' | 'holds' | 'blocked' | 'staff';

const ATTORNEYS = ['адвокат', 'адвоката', 'адвокатов'] as const;

/**
 * Owner 2026-10-05 — Верификация → «Борьба с мошенниками»
 * (docs/ATTORNEY_TRUST.md): the staff queue of attorneys waiting for a
 * person, the rules (what to require, what is automatic) and the holds.
 */
export default function AntiFraudPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canManage = me ? can(me, 'verification', 'manage') : false;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState<Tab>('attorneys');

  const stats = useQuery(trustStatsQuery);
  const recomputeAll = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Пересчитать всех адвокатов?',
        description: 'Статусы всех адвокатов будут вычислены заново по текущим правилам. Подтверждённые сотрудником остаются подтверждёнными.',
        confirm: 'Пересчитать',
      });
      if (!ok) return null;
      return (await api.POST('/admin/trust/recompute-all')).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(`Пересчитано: ${r.attorneys}, изменилось у ${r.changed}`);
      invalidateTrust(qc);
    },
    onError: (e) => toast.error(e),
  });

  const byLevel = (stats.data?.byLevel ?? []).map((x) => `${TRUST_LEVEL_RU[x.level]?.short ?? x.level}: ${x.attorneys}`).join(' · ');

  return (
    <>
      {confirmDialog}
      <PageHeader
        eyebrow="Люди · Верификация"
        title="Борьба с мошенниками"
        subtitle="Регистрация остаётся простой: адвокат называет штат и номер под присягой. Вы выбираете, что от него требовать; что проверяется автоматически — проверяется само, остальное ждёт человека в очереди. «Подтвердить» — и перепроверок больше нет."
        actions={
          canManage ? (
            <Button size="sm" variant="outline" className="w-44" loading={recomputeAll.isPending} onClick={() => recomputeAll.mutate()}>
              Пересчитать всех
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.isPending ? (
          <KpiSkeletons n={4} />
        ) : stats.data ? (
          <>
            <Kpi i={0} icon={SealCheck} title="Подтверждено" value={stats.data.cleared} hint={`с галочкой: ${stats.data.withBadge} · верифицировано: ${stats.data.verified}`} gold />
            <Kpi i={1} icon={Hourglass} title="В очереди" value={stats.data.inQueue} hint="ждут проверки человеком" warn />
            <Kpi i={2} icon={HandPalm} title="На холде" value={stats.data.held} hint="платежи или ставки приостановлены" warn />
            <Kpi i={3} icon={Warning} title="Жалоб за 30 дней" value={stats.data.complaints30d} hint={byLevel ? `по уровням — ${byLevel}` : 'мошенничество, самозванец'} warn />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <div className="mt-8 mb-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'attorneys', label: 'Адвокаты' },
            { value: 'queue', label: 'Очередь', count: stats.data?.inQueue },
            { value: 'rules', label: 'Правила' },
            { value: 'holds', label: 'Холды', count: stats.data?.held },
            { value: 'blocked', label: 'Заблокированные номера', count: stats.data?.blockedBarNumbers },
            { value: 'staff', label: 'Решения сотрудников' },
          ]}
        />
      </div>

      {tab === 'attorneys' ? <AttorneysList canManage={canManage} /> : null}
      {tab === 'queue' ? <Queue canManage={canManage} stats={stats.data} /> : null}
      {tab === 'rules' ? <Rules canManage={canManage} /> : null}
      {tab === 'holds' ? <Holds canManage={canManage} /> : null}
      {tab === 'blocked' ? <BlockedBarNumbers canManage={canManage} /> : null}
      {tab === 'staff' ? <StaffDecisions /> : null}
    </>
  );
}

// --- Очередь ---------------------------------------------------------------

function Queue({ canManage, stats }: { canManage: boolean; stats: Stats | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const { askDocuments, dialog: docDialog } = useDocumentRequest();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [reason, setReason] = useState<'' | QueueReason>('');
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 300);
  const filterKey = `${reason}|${search}`;
  const sel = useSelection(filterKey);

  const q = useQuery({
    queryKey: ['trust-queue', reason, search],
    queryFn: async () =>
      (await api.GET('/admin/trust/queue', { params: { query: { reason: reason || undefined, q: search || undefined } } })).data!.data,
  });
  const rows = q.data ?? [];
  const ids = rows.map((r) => r.attorney.id);
  const now = Date.now();
  const onError = (e: unknown) => toast.error(e);
  const done = (t: string) => {
    toast.success(t);
    invalidateTrust(qc);
    void qc.invalidateQueries({ queryKey: ['verification-queue'] });
  };
  const noteBody = (t: string) => (t ? { note: t } : {});
  const path = (attorneyId: string) => ({ params: { path: { attorneyId } } });

  const clear = useMutation({
    mutationFn: async (r: QueueItem) => {
      const a = await ask({
        title: `Подтвердить — ${attorneyName(r.attorney)}`,
        description: 'Вы ручаетесь: галочка и приём денег открываются насовсем, перепроверок больше не будет.',
        label: 'Что проверили (необязательно)',
        optionalText: true,
        max: TRUST_NOTE_MAX,
        confirm: 'Подтвердить',
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/clear', { ...path(r.attorney.id), body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Адвокат подтверждён'),
    onError,
  });
  const requestDocuments = useMutation({
    mutationFn: async (r: QueueItem) => {
      const d = await askDocuments(`Запросить ещё — ${attorneyName(r.attorney)}`);
      if (!d) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/request-documents', {
        ...path(r.attorney.id),
        body: { template: d.template as DocTemplate, ...noteBody(d.note) },
      });
    },
    onSuccess: (x) => x && done('Запрос документов отправлен'),
    onError,
  });
  const reject = useMutation({
    mutationFn: async (r: QueueItem) => {
      const a = await ask({
        title: `Отклонить — ${attorneyName(r.attorney)}`,
        description: 'Аккаунт приостанавливается, активные ставки отзываются. Адвокат получит уведомление с вашей заметкой.',
        label: 'Причина',
        min: 3,
        max: TRUST_NOTE_MAX,
        confirm: 'Отклонить',
        danger: true,
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/reject', { ...path(r.attorney.id), body: noteBody(a.text) });
    },
    onSuccess: (x) => x && done('Адвокат отклонён'),
    onError,
  });

  const bulk = useMutation({
    mutationFn: async (action: 'clear' | 'request_documents' | 'reject' | 'release') => {
      const attorneyIds = [...sel.selected];
      const n = attorneyIds.length;
      let body: components['schemas']['BulkTrustDto'] = { attorneyIds, action };
      if (action === 'request_documents') {
        const d = await askDocuments(`Запросить ещё у ${n} адвокатов`);
        if (!d) return null;
        body = { ...body, template: d.template as DocTemplate, ...noteBody(d.note) };
      } else if (action === 'reject') {
        const a = await ask({ title: `Отклонить ${n} адвокатов`, description: 'Аккаунты приостанавливаются, ставки отзываются.', label: 'Причина', min: 3, max: TRUST_NOTE_MAX, confirm: 'Отклонить', danger: true });
        if (!a) return null;
        body = { ...body, ...noteBody(a.text) };
      } else {
        const ok = await confirm({
          title: action === 'clear' ? `Подтвердить ${n} адвокатов?` : `Снять холды у ${n} адвокатов?`,
          description: action === 'clear' ? 'Галочка и приём денег откроются насовсем у каждого выбранного.' : 'Платежи и ставки возобновятся у каждого выбранного.',
          confirm: action === 'clear' ? 'Подтвердить' : 'Снять холды',
        });
        if (!ok) return null;
      }
      return (await api.POST('/admin/trust/bulk', { body })).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      sel.clear();
      done(r.failed.length ? `Готово: ${r.done}, не удалось: ${r.failed.length}` : `Готово: ${r.done}`);
    },
    onError,
  });

  const rowBusy = (id: string) =>
    (clear.isPending && clear.variables?.attorney.id === id) ||
    (requestDocuments.isPending && requestDocuments.variables?.attorney.id === id) ||
    (reject.isPending && reject.variables?.attorney.id === id);
  const cols = canManage ? 8 : 6;

  return (
    <>
      {dialog}
      {docDialog}
      {confirmDialog}
      {stats && !stats.enabled ? (
        <p className="mb-3 max-w-3xl rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
          Защита выключена: очередь пуста, все адвокаты с присягой подтверждены автоматически.
        </p>
      ) : stats && !stats.manualReview ? (
        <p className="mb-3 max-w-3xl rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          Ручная проверка выключена — очередь на паузе. Записи сохраняются; включите ручную проверку в «Правилах», чтобы продолжить.
        </p>
      ) : null}
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Адвокаты, которых надо посмотреть человеку: загрузили документы, нужна связь с фирмой, имя в Stripe не совпало, номер заявлен дважды, реестр не
        подтвердил, пришла жалоба. Старые сверху.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Причина" className="w-60" value={reason} onChange={(e) => setReason(e.target.value as '' | QueueReason)}>
          <option value="">Все причины</option>
          {QUEUE_REASONS.map((r) => (
            <option key={r} value={r}>
              {QUEUE_REASON_RU[r].text}
            </option>
          ))}
        </Select>
        <Input aria-label="Поиск" className="w-64" placeholder="Имя или @username" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {canManage ? (
        <BulkBar
          selectedCount={sel.selected.size}
          noun={ATTORNEYS}
          onClear={sel.clear}
          onSelectAll={async () => {
            sel.replace(ids);
            return false;
          }}
        >
          <Button size="sm" variant="gold" className="w-32" disabled={bulk.isPending} onClick={() => bulk.mutate('clear')}>
            Подтвердить
          </Button>
          <Button size="sm" variant="outline" className="w-32" disabled={bulk.isPending} onClick={() => bulk.mutate('request_documents')}>
            Запросить ещё
          </Button>
          <Button size="sm" variant="danger" className="w-32" disabled={bulk.isPending} onClick={() => bulk.mutate('reject')}>
            Отклонить
          </Button>
          <Button size="sm" variant="soft" className="w-32" disabled={bulk.isPending} onClick={() => bulk.mutate('release')}>
            Снять холды
          </Button>
        </BulkBar>
      ) : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            {canManage ? (
              <Th className="w-10">
                <PageSelectBox selected={sel.selected} ids={ids} onToggle={sel.togglePage} />
              </Th>
            ) : null}
            <Th>Адвокат</Th>
            <Th>Ждёт</Th>
            <Th>Почему</Th>
            <Th>Не хватает</Th>
            <Th>Stripe</Th>
            <Th>Документы</Th>
            {canManage ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={cols} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={cols}>Очередь пуста — никого проверять не нужно.</TableEmpty>
          ) : (
            rows.map((r, i) => (
              <MotionRow key={r.attorney.id} i={i}>
                {canManage ? (
                  <Td>
                    <RowSelectBox selected={sel.selected} id={r.attorney.id} onToggle={sel.toggle} />
                  </Td>
                ) : null}
                <Td>
                  <Link href={`/verification/trust/${r.attorney.id}`} className="font-medium text-heading hover:underline">
                    {attorneyName(r.attorney)}
                  </Link>
                  <div className="text-xs text-faint">@{r.attorney.username}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <BadgeStatusChip status={r.badgeStatus} />
                    <TrustLevelChip level={r.level} />
                    {r.holds.payments ? <Badge tone="danger">платежи: {HOLD_RU[r.holds.payments] ?? r.holds.payments}</Badge> : null}
                    {r.holds.bids ? <Badge tone="danger">ставки: {HOLD_RU[r.holds.bids] ?? r.holds.bids}</Badge> : null}
                    {r.blocked ? <BlockedChip /> : null}
                  </div>
                  {r.lookups.length ? (
                    <BarLookups lookups={r.lookups} compact className="mt-1.5 w-72 max-w-full" />
                  ) : r.registryLinks.length ? (
                    <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
                      {r.registryLinks.map((l) =>
                        l.url ? (
                          <a key={l.stateCode} href={l.url} target="_blank" rel="noreferrer" className="text-primary underline">
                            Реестр {l.stateCode}
                          </a>
                        ) : (
                          <span key={l.stateCode} className="text-muted">
                            {l.stateCode}: без ссылки
                          </span>
                        ),
                      )}
                    </div>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="tabular-nums">{r.waitingSince ? formatDuration(Math.floor((now - new Date(r.waitingSince).getTime()) / 1000)) : '—'}</div>
                  <div className="text-xs text-muted">{formatDateTime(r.waitingSince)}</div>
                </Td>
                <Td>
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {r.reasons.map((x) => (
                      <Badge key={x} tone={QUEUE_REASON_RU[x]?.tone ?? 'neutral'} dot>
                        {QUEUE_REASON_RU[x]?.text ?? x}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td className="text-xs">{r.missing.length ? missingText(r.missing) : <span className="text-muted">всё пройдено</span>}</Td>
                <Td className="text-xs">
                  {r.stripeBusinessType ? (
                    <>
                      <div>{BUSINESS_TYPE_RU[r.stripeBusinessType] ?? r.stripeBusinessType}</div>
                      {r.stripeCompanyName ? <div className="text-muted">{r.stripeCompanyName}</div> : null}
                      {r.stripeRepresentative ? <div className="text-muted">предст.: {r.stripeRepresentative}</div> : null}
                    </>
                  ) : (
                    <span className="text-muted">нет KYC</span>
                  )}
                </Td>
                <Td className="text-xs">
                  {r.requestId ? (
                    <Link href={`/verification/${r.requestId}`} className="text-gold-600 hover:underline">
                      {r.documentsCount} шт. → заявка
                    </Link>
                  ) : (
                    <span className="text-muted">{r.documentsCount}</span>
                  )}
                  {r.documentsRequestedAt ? <div className="text-muted">запрошены {formatDateTime(r.documentsRequestedAt)}</div> : null}
                </Td>
                {canManage ? (
                  <Td>
                    <div className="flex flex-col items-stretch gap-1.5">
                      <Button size="sm" variant="gold" className="w-32" loading={clear.isPending && clear.variables?.attorney.id === r.attorney.id} disabled={rowBusy(r.attorney.id)} onClick={() => clear.mutate(r)}>
                        Подтвердить
                      </Button>
                      <Button size="sm" variant="outline" className="w-32" loading={requestDocuments.isPending && requestDocuments.variables?.attorney.id === r.attorney.id} disabled={rowBusy(r.attorney.id)} onClick={() => requestDocuments.mutate(r)}>
                        Запросить ещё
                      </Button>
                      <Button size="sm" variant="danger-soft" className="w-32" loading={reject.isPending && reject.variables?.attorney.id === r.attorney.id} disabled={rowBusy(r.attorney.id)} onClick={() => reject.mutate(r)}>
                        Отклонить
                      </Button>
                    </div>
                  </Td>
                ) : null}
              </MotionRow>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}

// --- Правила ---------------------------------------------------------------

function Rules({ canManage }: { canManage: boolean }) {
  const settings = useQuery({
    queryKey: ['trust-settings'],
    queryFn: async () => (await api.GET('/admin/trust/settings')).data!.data,
  });
  if (settings.isPending) return <Skeleton className="h-96 rounded-[var(--radius-lg)]" />;
  if (!settings.data) return <ErrorNote text={settings.error ? errorText(settings.error) : 'Не удалось загрузить правила'} />;
  return <RulesForm key={JSON.stringify(settings.data)} initial={settings.data} canEdit={canManage} />;
}

type BoolKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

/** Owner's one-click sets (`POST /admin/trust/settings/preset`); fixed-width buttons. */
const PRESETS: { value: Preset; label: string; title: string; description: string; danger?: boolean }[] = [
  {
    value: 'off',
    label: 'Выключить всё',
    title: 'Выключить всю защиту?',
    description:
      'Защита и ручная проверка выключаются, все требования и автоматические холды снимаются. Адвокаты с присягой получают галочку и приём оплат сразу; очередь пустеет, холды ничего не закрывают.',
    danger: true,
  },
  {
    value: 'soft',
    label: 'Мягко',
    title: 'Применить набор «Мягко»?',
    description:
      'Защита включена, ручной проверки нет: только автоматические проверки (реестр штата), документы не требуются, ставки и чат открыты сразу. Холды по жалобам остаются.',
  },
  {
    value: 'standard',
    label: 'Стандарт',
    title: 'Применить набор «Стандарт»?',
    description:
      'Защита и ручная проверка включены: реестр и личность (Stripe KYC или связь с фирмой) обязательны, документы — нет; ставки открыты, автоматические холды работают.',
  },
  {
    value: 'strict',
    label: 'Строго',
    title: 'Применить набор «Строго»?',
    description: 'Реестр, личность и документы обязательны; ставки только после подтверждения; задержка выплат и все автоматические холды включены.',
  },
  {
    value: 'all',
    label: 'Включить всё',
    title: 'Включить все меры защиты?',
    description:
      'Каждый переключатель включается: защита, ручная проверка, все требования, ставки только после подтверждения, все автоматические холды и связи с фирмой.',
  },
];

function RulesForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [s, setS] = useState<Settings>(initial);
  const [payout, setPayout] = useState(String(initial.payoutDelayDays));
  const [toSuspend, setToSuspend] = useState(String(initial.complaintsToSuspend));
  const [windowDays, setWindowDays] = useState(String(initial.complaintWindowDays));
  const int = (raw: string, min: number, max: number) => {
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n >= min && n <= max ? n : null;
  };
  const payoutDays = int(payout, 0, 30);
  const complaintsToSuspend = int(toSuspend, 1, 20);
  const complaintWindowDays = int(windowDays, 1, 3650);
  const valid = payoutDays !== null && complaintsToSuspend !== null && complaintWindowDays !== null;
  const set = (k: BoolKey, v: boolean) => setS((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PUT('/admin/trust/settings', {
          body: {
            ...s,
            payoutDelayDays: payoutDays ?? initial.payoutDelayDays,
            complaintsToSuspend: complaintsToSuspend ?? initial.complaintsToSuspend,
            complaintWindowDays: complaintWindowDays ?? initial.complaintWindowDays,
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Правила сохранены. «Пересчитать всех» применит их к текущим адвокатам.');
      void qc.invalidateQueries({ queryKey: ['trust-settings'] });
    },
    onError: (e) => toast.error(e),
  });
  const preset = useMutation({
    mutationFn: async (p: (typeof PRESETS)[number]) => {
      const ok = await confirm({ title: p.title, description: p.description, confirm: p.label, danger: p.danger });
      if (!ok) return null;
      return (await api.POST('/admin/trust/settings/preset', { body: { preset: p.value } })).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success('Правила применены; адвокаты пересчитываются, кому что-то стало требоваться — получат уведомление');
      void qc.invalidateQueries({ queryKey: ['trust-settings'] });
      void qc.invalidateQueries({ queryKey: ['trust-attorneys'] });
      invalidateTrust(qc);
    },
    onError: (e) => toast.error(e),
  });
  const busy = save.isPending || preset.isPending;

  const toggle = (k: BoolKey, title: string, on: string, off: string) => (
    <div key={k} className="flex items-start justify-between gap-4 rounded-xl bg-surface-2 px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-xs text-muted">{s[k] ? on : off}</p>
      </div>
      <Switch checked={s[k]} onChange={(v) => set(k, v)} disabled={!canEdit} label={title} className="mt-0.5" />
    </div>
  );

  return (
    <>
      {confirmDialog}
      <Card className="mb-4 p-5">
        <h3 className="font-medium text-heading">Главные выключатели</h3>
        <p className="mt-1 text-sm text-muted">Всё ниже можно выключить одним движением и включить обратно — ничего не теряется.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className={cn('flex items-start justify-between gap-4 rounded-xl px-3.5 py-3', s.enabled ? 'bg-accent-soft' : 'bg-danger-soft/40')}>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">Защита включена</div>
              <p className="mt-0.5 text-xs text-muted">
                {s.enabled
                  ? 'Включено: требования, очередь и холды работают по правилам ниже.'
                  : 'Выключено (режим до защиты): адвокаты с присягой получают галочку и приём оплат сразу, холды ничего не закрывают, очередь пуста.'}
              </p>
            </div>
            <Switch checked={s.enabled} onChange={(v) => set('enabled', v)} disabled={!canEdit} label="Защита включена" className="mt-0.5" />
          </div>
          <div className={cn('flex items-start justify-between gap-4 rounded-xl px-3.5 py-3', s.manualReview ? 'bg-accent-soft' : 'bg-surface-2')}>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">Ручная проверка сотрудниками</div>
              <p className="mt-0.5 text-xs text-muted">
                {s.manualReview
                  ? 'Включено: что нельзя проверить автоматически, ждёт человека в очереди; документы сверяет сотрудник.'
                  : 'Выключено: только автоматические проверки. Очередь на паузе, требование документов не действует; ничего не теряется.'}
              </p>
            </div>
            <Switch checked={s.manualReview} onChange={(v) => set('manualReview', v)} disabled={!canEdit} label="Ручная проверка сотрудниками" className="mt-0.5" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={p.value === 'off' ? 'danger-soft' : p.value === 'all' ? 'gold' : 'outline'}
              className="w-36 shrink-0"
              disabled={!canEdit || busy}
              loading={preset.isPending && preset.variables?.value === p.value}
              onClick={() => preset.mutate(p)}
            >
              {p.label}
            </Button>
          ))}
          <span className="text-xs text-faint">Набор применяется сразу, без «Сохранить».</span>
        </div>
      </Card>

      <Card className="p-5">
        {!s.enabled ? (
          <p className="mb-4 rounded-xl bg-danger-soft/40 px-3.5 py-2.5 text-sm text-danger">
            Защита выключена: все адвокаты с присягой получают галочку и приём оплат сразу.
          </p>
        ) : null}
        <div className={cn('transition-opacity duration-300', !s.enabled && 'opacity-50')}>
        <h3 className="font-medium text-heading">Что требовать от адвоката для галочки и приёма денег</h3>
        <p className="mt-1 text-sm text-muted">
          Что можно проверить автоматически — проверяется само (реестр штата, Stripe KYC, e-mail фирмы). Что нельзя — попадает в очередь к сотруднику. После
          «Подтвердить» адвокат больше не перепроверяется.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {toggle(
            'requireRegistry',
            'Реестр штата',
            'Включено: номер лицензии должен совпасть с реестром штата; где нет API — сотрудник проверяет по ссылке коллегии (очередь).',
            'Выключено: достаточно присяги — номер со слов адвоката.',
          )}
          {toggle(
            'requireIdentity',
            'Личность',
            'Включено: нужен Stripe KYC на самого адвоката (имя совпало) или подтверждённая связь с фирмой, если аккаунт на компанию.',
            'Выключено: кто стоит за аккаунтом Stripe, не проверяется.',
          )}
          {toggle(
            'requireDocuments',
            'Документы',
            'Включено: адвокат загружает удостоверение, селфи и карточку адвоката, сотрудник сверяет их в очереди.',
            'Выключено: документы не требуются (можно запросить вручную у подозрительных).',
          )}
        </div>

        <h4 className="mt-6 text-sm font-medium text-heading">Что открыто до подтверждения</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {toggle(
            'bidsRequireCleared',
            'Ставки только после подтверждения',
            'Включено: пока требования не пройдены, адвокат не может откликаться на кейсы и писать клиентам.',
            'Выключено: ставки и чат открыты сразу, закрыты только галочка и приём денег.',
          )}
          <div className="rounded-xl bg-surface-2 px-3.5 py-3">
            <Field label="Задержка выплат Stripe, дней" htmlFor="ts-payout" hint="0–30; 0 — стандартный график Stripe. Деньги клиента ждут на балансе, пока адвокат не подтверждён.">
              <Input id="ts-payout" inputMode="numeric" className="w-28" value={payout} disabled={!canEdit} onChange={(e) => setPayout(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        </div>

        <h4 className="mt-6 text-sm font-medium text-heading">Автоматические защиты</h4>
        <p className="mt-1 text-xs text-muted">Каждую можно выключить отдельно; выключенная ничего не делает сама — решает сотрудник.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {toggle(
            'autoHoldOnComplaint',
            'Холд при жалобе на мошенничество',
            'Включено: жалоба клиента «мошенничество» или «самозванец» сразу ставит холд на платежи и ставки и отправляет адвоката в очередь.',
            'Выключено: жалоба уходит в модерацию, адвокат работает, пока сотрудник не поставит холд вручную.',
          )}
          {toggle(
            'autoHoldOnNameMismatch',
            'Холд при несовпадении имени в Stripe',
            'Включено: имя из Stripe KYC не совпало с профилем и реестром — платежи на холд, адвокат в очереди.',
            'Выключено: несовпадение только отмечается в карточке; платежи продолжаются.',
          )}
          {toggle(
            'flagDuplicateClaims',
            'Отмечать повторные заявки номера',
            'Включено: кто-то регистрируется с занятым номером — владелец номера попадает в очередь на сверку с реестром.',
            'Выключено: повторная заявка отклоняется без отметки у владельца.',
          )}
          {toggle(
            'blockOnReject',
            'Отклонение блокирует номер лицензии',
            'Включено: отклонённый или приостановленный адвокат не сможет зарегистрировать этот номер снова под другим именем или новым аккаунтом.',
            'Выключено: номер отклонённого адвоката остаётся свободным; блокировать можно вручную во вкладке «Заблокированные номера».',
          )}
          {toggle(
            'blockContacts',
            'Блокировать также e-mail и телефон',
            'Включено: вместе с номером в блок-лист попадают e-mail и телефон отклонённого аккаунта — с них тоже не зарегистрироваться.',
            'Выключено: блокируется только номер лицензии.',
          )}
          <div className="rounded-xl bg-surface-2 px-3.5 py-3">
            <div className="text-sm font-medium text-ink">Автоприостановка по жалобам</div>
            <p className="mt-0.5 text-xs text-muted">Столько разных клиентов пожаловались за окно — профиль приостанавливается до разбора.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Жалоб" htmlFor="ts-cts" hint="1–20">
                <Input id="ts-cts" inputMode="numeric" value={toSuspend} disabled={!canEdit} onChange={(e) => setToSuspend(e.target.value.replace(/\D/g, ''))} />
              </Field>
              <Field label="Окно, дней" htmlFor="ts-win" hint="1–3650">
                <Input id="ts-win" inputMode="numeric" value={windowDays} disabled={!canEdit} onChange={(e) => setWindowDays(e.target.value.replace(/\D/g, ''))} />
              </Field>
            </div>
          </div>
        </div>

        <h4 className="mt-6 text-sm font-medium text-heading">Связь с фирмой (Stripe-аккаунт компании)</h4>
        <p className="mt-1 text-xs text-muted">
          Если аккаунт Stripe оформлен на компанию, где адвокат не владелец и не представитель, личность засчитывается после подтверждения связи с фирмой:
          автоматически одним из способов ниже или сотрудником по письму на бланке.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {toggle(
            'firmLinkAutoRegistry',
            'Связь по реестру штата',
            'Включено: фирма в реестре штата совпала с названием компании в Stripe — связь подтверждается сама.',
            'Выключено: совпадение с реестром не засчитывается — нужен e-mail фирмы или сотрудник.',
          )}
          {toggle(
            'firmLinkAutoEmail',
            'Связь по e-mail фирмы',
            'Включено: адвокат подтверждает кодом адрес на домене сайта компании из Stripe — связь засчитывается сама.',
            'Выключено: e-mail не засчитывается — только реестр или сотрудник.',
          )}
        </div>

        </div>

        {canEdit ? (
          <div className="mt-5 flex items-center justify-end gap-3">
            {!valid ? <span className="text-xs text-danger">Проверьте числа: они вне допустимых границ.</span> : null}
            <Button className="w-36" disabled={!valid || busy} loading={save.isPending} onClick={() => save.mutate()}>
              Сохранить
            </Button>
          </div>
        ) : (
          <p className="mt-5 text-xs text-faint">Менять правила может верификатор с правом «управление» или супер-админ.</p>
        )}
      </Card>
    </>
  );
}

// --- Холды -----------------------------------------------------------------

function Holds({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const q = useQuery({
    queryKey: ['trust-holds'],
    queryFn: async () => (await api.GET('/admin/trust/holds')).data!.data,
  });
  const release = useMutation({
    mutationFn: async (row: components['schemas']['TrustHoldListItemDto']) => {
      const a = await ask({
        title: `Снять холд — ${attorneyName(row.attorney)}`,
        description: 'Платежи и ставки возобновятся, адвокат получит уведомление.',
        label: 'Что проверили (необязательно)',
        optionalText: true,
        max: TRUST_NOTE_MAX,
        confirm: 'Снять холд',
      });
      if (!a) return null;
      return api.POST('/admin/trust/attorneys/{attorneyId}/release', {
        params: { path: { attorneyId: row.attorney.id } },
        body: { payments: Boolean(row.holds.payments), bids: Boolean(row.holds.bids), ...(a.text ? { note: a.text } : {}) },
      });
    },
    onSuccess: (x) => {
      if (!x) return;
      toast.success('Холд снят');
      invalidateTrust(qc);
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data ?? [];
  const cols = canManage ? 7 : 6;

  return (
    <>
      {dialog}
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Адвокаты, у которых приостановлены платежи или новые ставки — автоматически (жалоба, несовпадение имени, чужая заявка на номер) или сотрудником.
        Разберитесь по карточке и снимите холд.
      </p>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Адвокат</Th>
            <Th>Уровень</Th>
            <Th>Что остановлено</Th>
            <Th>Причина</Th>
            <Th>Жалоб</Th>
            <Th>С</Th>
            {canManage ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={cols} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={cols}>Холдов нет.</TableEmpty>
          ) : (
            rows.map((r, i) => {
              const reasons = [...new Set([r.holds.payments, r.holds.bids].filter((x): x is string => Boolean(x)))];
              return (
                <MotionRow key={r.attorney.id} i={i}>
                  <Td>
                    <Link href={`/verification/trust/${r.attorney.id}`} className="font-medium text-heading hover:underline">
                      {attorneyName(r.attorney)}
                    </Link>
                    <div className="text-xs text-faint">@{r.attorney.username}</div>
                  </Td>
                  <Td>
                    <TrustLevelChip level={r.level} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.holds.payments ? <Badge tone="danger">платежи</Badge> : null}
                      {r.holds.bids ? <Badge tone="danger">ставки</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      {reasons.map((code) => (
                        <Badge key={code} tone="warning" dot>
                          {HOLD_RU[code] ?? code}
                        </Badge>
                      ))}
                    </div>
                    {r.holds.note ? <div className="mt-1 max-w-64 text-xs text-muted">{r.holds.note}</div> : null}
                  </Td>
                  <Td className={r.complaintsTotal > 0 ? 'font-medium text-warning' : 'text-muted'}>{r.complaintsTotal}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.heldSince)}</Td>
                  {canManage ? (
                    <Td>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-28"
                          loading={release.isPending && release.variables?.attorney.id === r.attorney.id}
                          disabled={release.isPending}
                          onClick={() => release.mutate(r)}
                        >
                          Снять холд
                        </Button>
                      </div>
                    </Td>
                  ) : null}
                </MotionRow>
              );
            })
          )}
        </tbody>
      </Table>
    </>
  );
}
