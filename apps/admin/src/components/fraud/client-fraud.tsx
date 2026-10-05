'use client';

import { Prohibit, ShieldWarning, UserMinus, Warning } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import {
  FRAUD_ACTOR_RU,
  FRAUD_MATCH_ACTION_RU,
  FRAUD_MATCH_ACTIONS,
  FRAUD_QUEUE_FILTER_RU,
  FRAUD_QUEUE_REASON_RU,
  FRAUD_SIGNAL_RU,
  FraudEventChip,
  FraudStatusChip,
  fraudUserName,
  KindChips,
  maskedContacts,
  type FraudMatchAction,
  type FraudQueueFilter,
} from '@/lib/fraud-labels';
import { fraudStatsQuery } from '@/lib/live';
import { ROLE_TEXT } from '@/lib/labels';
import { cn, formatDateTime } from '@/lib/utils';

type Settings = components['schemas']['FraudSettingsDto'];
type Preset = components['schemas']['FraudPreset'];
type Actor = components['schemas']['FraudEventsActorFilter'];
type SubTab = 'queue' | 'rules' | 'events';

/** API limit of a staff note (`FRAUD_NOTE_MAX`). */
export const FRAUD_NOTE_MAX = 500;

/** Query key of one person's fraud card (invalidated after every action). */
export const fraudCardKey = (userId: string) => ['fraud-card', userId] as const;

/** Every list the client-fraud actions change. */
export function invalidateFraud(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  if (userId) void qc.invalidateQueries({ queryKey: fraudCardKey(userId) });
  else void qc.invalidateQueries({ queryKey: ['fraud-card'] });
  void qc.invalidateQueries({ queryKey: ['fraud-queue'] });
  void qc.invalidateQueries({ queryKey: ['fraud-events'] });
  void qc.invalidateQueries({ queryKey: ['fraud-stats'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

/**
 * Owner 2026-10-05 — «Борьба с мошенниками → Клиенты»: blocked fraudsters
 * cannot come back with a new account, and complaints of attorneys add up
 * to a client risk score. Everything is automatic; staff only look at the
 * queue. Writes need `verification: manage`.
 */
export function ClientFraud({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState<SubTab>('queue');
  const stats = useQuery(fraudStatsQuery);
  const s = stats.data;

  const recomputeAll = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Пересчитать всех клиентов?',
        description: 'Балл риска и статус каждого клиента будут вычислены заново по текущим правилам. Решения сотрудников сохраняются.',
        confirm: 'Пересчитать',
      });
      if (!ok) return null;
      return (await api.POST('/admin/fraud/recompute-all')).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(`Пересчитано: ${r.accounts}, изменилось у ${r.changed}`);
      invalidateFraud(qc);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      {confirmDialog}
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Заблокированный мошенник не вернётся с тем же телефоном, почтой, аккаунтом Apple или Google, картой или со своего телефона (устройства). Жалобы
        адвокатов, которые работали с клиентом, складываются в балл риска. Всё происходит автоматически — сотрудникам остаётся только просматривать очередь.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.isPending ? (
          <KpiSkeletons n={4} />
        ) : s ? (
          <>
            <Kpi i={0} icon={ShieldWarning} title="На проверке" value={s.review} hint="аккаунт работает, ждёт сотрудника" warn />
            <Kpi i={1} icon={UserMinus} title="Ограничены" value={s.restricted} hint="не публикуют кейсы и не пишут адвокатам" warn />
            <Kpi i={2} icon={Prohibit} title="Заблокированы" value={s.banned} hint={`автоматически за 30 дней: ${s.autoBanned30d}`} />
            <Kpi i={3} icon={Warning} title="Отказано во входе за 30 дней" value={s.blockedSignIns30d} hint="повторные аккаунты заблокированных" />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />
      {s && !s.enabled ? (
        <p className="mt-4 max-w-3xl rounded-xl bg-danger-soft/40 px-3.5 py-2.5 text-sm text-danger">
          Защита выключена: повторные аккаунты не проверяются, балл риска не считается. Включите её в «Правилах».
        </p>
      ) : s && !s.auto ? (
        <p className="mt-4 max-w-3xl rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          Автоматические действия выключены: никто не ограничивается и не блокируется сам — все совпадения только попадают в очередь.
        </p>
      ) : null}

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<SubTab>
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'queue', label: 'Очередь', count: s ? s.review + s.restricted : null },
            { value: 'rules', label: 'Правила' },
            { value: 'events', label: 'Решения' },
          ]}
        />
        {canManage ? (
          <Button size="sm" variant="outline" className="w-44 shrink-0" loading={recomputeAll.isPending} onClick={() => recomputeAll.mutate()}>
            Пересчитать всех
          </Button>
        ) : null}
      </div>

      {tab === 'queue' ? <FraudQueue /> : null}
      {tab === 'rules' ? <FraudRules canManage={canManage} /> : null}
      {tab === 'events' ? <FraudEvents /> : null}
    </>
  );
}

// --- Очередь ---------------------------------------------------------------

const QUEUE_FILTERS: FraudQueueFilter[] = ['queue', 'review', 'restricted', 'banned', 'ok', 'all'];

function FraudQueue() {
  const [status, setStatus] = useState<FraudQueueFilter>('queue');
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 300);
  const q = useQuery({
    queryKey: ['fraud-queue', status, search],
    queryFn: async () =>
      (await api.GET('/admin/fraud/queue', { params: { query: { status, q: search || undefined, limit: 200 } } })).data!.data,
  });
  const rows = q.data ?? [];

  return (
    <>
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Клиенты, которых система отправила на проверку или ограничила: высокий балл риска или общий телефон, почта, карта или устройство с
        заблокированным. Откройте карточку, чтобы посмотреть, за что, и снять или подтвердить решение.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Статус" className="w-72 max-w-full" value={status} onChange={(e) => setStatus(e.target.value as FraudQueueFilter)}>
          {QUEUE_FILTERS.map((f) => (
            <option key={f} value={f}>
              {FRAUD_QUEUE_FILTER_RU[f]}
            </option>
          ))}
        </Select>
        <Input aria-label="Поиск" className="w-64 max-w-full" placeholder="Имя, почта, телефон или id" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Человек</Th>
            <Th>Роль</Th>
            <Th>Статус</Th>
            <Th>Балл</Th>
            <Th>Главные сигналы</Th>
            <Th>Почему</Th>
            <Th>В очереди с</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={8} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={8}>{status === 'queue' ? 'Очередь пуста — никого проверять не нужно.' : 'Никого не найдено.'}</TableEmpty>
          ) : (
            rows.map((r, i) => {
              const top = [...r.signals].sort((a, b) => b.points - a.points).slice(0, 3);
              return (
                <MotionRow key={r.user.id} i={i}>
                  <Td className="max-w-64">
                    <Link href={`/verification/trust/clients/${r.user.id}`} className="block truncate font-medium text-heading hover:underline">
                      {fraudUserName(r.user)}
                    </Link>
                    <div className="truncate text-xs text-faint">{maskedContacts(r.user)}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{r.user.role ? (ROLE_TEXT[r.user.role] ?? r.user.role) : '—'}</Td>
                  <Td>
                    <FraudStatusChip status={r.status} />
                  </Td>
                  <Td className="font-semibold tabular-nums text-heading">{r.score}</Td>
                  <Td>
                    {top.length ? (
                      <ul className="max-w-72 space-y-0.5 text-xs">
                        {top.map((x) => (
                          <li key={x.code} className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 text-muted">
                              {FRAUD_SIGNAL_RU[x.code] ?? x.code}
                              {x.count > 1 ? ` ×${x.count}` : ''}
                            </span>
                            <span className="shrink-0 tabular-nums text-ink">+{x.points}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-muted">нет</span>
                    )}
                  </Td>
                  <Td>
                    {r.queueReason ? (
                      <Badge tone={FRAUD_QUEUE_REASON_RU[r.queueReason]?.tone ?? 'neutral'} dot>
                        {FRAUD_QUEUE_REASON_RU[r.queueReason]?.text ?? r.queueReason}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.queuedAt)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Link
                        href={`/verification/trust/clients/${r.user.id}`}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-28 shrink-0')}
                      >
                        Карточка
                      </Link>
                    </div>
                  </Td>
                </MotionRow>
              );
            })
          )}
        </tbody>
      </Table>
    </>
  );
}

// --- Правила ---------------------------------------------------------------

function FraudRules({ canManage }: { canManage: boolean }) {
  const settings = useQuery({
    queryKey: ['fraud-settings'],
    queryFn: async () => (await api.GET('/admin/fraud/settings')).data!.data,
  });
  if (settings.isPending) return <Skeleton className="h-96 rounded-[var(--radius-lg)]" />;
  if (!settings.data) return <ErrorNote text={settings.error ? errorText(settings.error) : 'Не удалось загрузить правила'} />;
  return <FraudRulesForm key={JSON.stringify(settings.data)} initial={settings.data} canEdit={canManage} />;
}

/** Owner's one-click sets (`POST /admin/fraud/settings/preset`); fixed-width buttons. */
const PRESETS: { value: Preset; label: string; title: string; description: string; danger?: boolean }[] = [
  {
    value: 'off',
    label: 'Выключить',
    title: 'Выключить защиту от мошенников-клиентов?',
    description: 'Повторные аккаунты заблокированных больше не проверяются, балл риска не считается, никто не ограничивается автоматически.',
    danger: true,
  },
  {
    value: 'soft',
    label: 'Мягко',
    title: 'Применить набор «Мягко»?',
    description: 'Совпадения с заблокированным только ограничивают аккаунт и отправляют на проверку; пороги балла высокие (50 / 90 / 150).',
  },
  {
    value: 'standard',
    label: 'Стандарт',
    title: 'Применить набор «Стандарт»?',
    description: 'Тот же телефон, почта, Apple/Google или карта — вход запрещён сразу; то же устройство — на проверку. Пороги 30 / 60 / 100.',
  },
  {
    value: 'strict',
    label: 'Строго',
    title: 'Применить набор «Строго»?',
    description: 'Любое сильное совпадение, включая устройство, — блокировка сразу. Низкие пороги балла (20 / 40 / 70).',
  },
];

type NumKey =
  | 'reviewScore'
  | 'restrictScore'
  | 'banScore'
  | 'weightFraudReport'
  | 'weightReport'
  | 'weightChargeback'
  | 'windowDays'
  | 'fingerprintRetentionDays'
  | 'blockedRetentionDays';

const NUMS: Record<NumKey, { label: string; min: number; max: number; hint: string }> = {
  reviewScore: { label: 'На проверку с балла', min: 1, max: 1000, hint: '1–1000; аккаунт работает, но попадает в очередь.' },
  restrictScore: { label: 'Ограничить с балла', min: 1, max: 1000, hint: '1–1000; нельзя публиковать кейсы и писать адвокатам.' },
  banScore: { label: 'Заблокировать с балла', min: 1, max: 1000, hint: '1–1000; аккаунт приостанавливается.' },
  weightFraudReport: { label: 'Жалоба на мошенничество', min: 0, max: 200, hint: '0–200 баллов за каждую' },
  weightReport: { label: 'Другая жалоба адвоката', min: 0, max: 200, hint: '0–200 баллов за каждую' },
  weightChargeback: { label: 'Chargeback', min: 0, max: 200, hint: '0–200 баллов за каждый возврат через банк' },
  windowDays: { label: 'Окно, дней', min: 7, max: 3650, hint: '7–3650; старые жалобы не считаются' },
  fingerprintRetentionDays: { label: 'Хранить отпечатки, дней', min: 30, max: 3650, hint: '30–3650; обычные аккаунты' },
  blockedRetentionDays: { label: 'Хранить у заблокированных, дней', min: 30, max: 3650, hint: '30–3650; сколько помнить заблокированных' },
};
const NUM_KEYS = Object.keys(NUMS) as NumKey[];

function FraudRulesForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [s, setS] = useState<Settings>(initial);
  const [raw, setRaw] = useState<Record<NumKey, string>>(
    () => Object.fromEntries(NUM_KEYS.map((k) => [k, String(initial[k])])) as Record<NumKey, string>,
  );
  const parsed = Object.fromEntries(
    NUM_KEYS.map((k) => {
      const v = raw[k];
      const n = /^\d+$/.test(v) ? Number(v) : NaN;
      return [k, n >= NUMS[k].min && n <= NUMS[k].max ? n : null];
    }),
  ) as Record<NumKey, number | null>;
  const allValid = NUM_KEYS.every((k) => parsed[k] !== null);
  const ordered =
    parsed.reviewScore === null ||
    parsed.restrictScore === null ||
    parsed.banScore === null ||
    (parsed.reviewScore <= parsed.restrictScore && parsed.restrictScore <= parsed.banScore);
  const valid = allValid && ordered;

  const save = useMutation({
    mutationFn: async () => {
      const nums = Object.fromEntries(NUM_KEYS.map((k) => [k, parsed[k] ?? initial[k]])) as Pick<Settings, NumKey>;
      return (await api.PUT('/admin/fraud/settings', { body: { ...s, ...nums } })).data!.data;
    },
    onSuccess: () => {
      toast.success('Правила сохранены. «Пересчитать всех» применит их к текущим клиентам.');
      void qc.invalidateQueries({ queryKey: ['fraud-settings'] });
      void qc.invalidateQueries({ queryKey: ['fraud-stats'] });
    },
    onError: (e) => toast.error(e),
  });
  const preset = useMutation({
    mutationFn: async (p: (typeof PRESETS)[number]) => {
      const ok = await confirm({ title: p.title, description: p.description, confirm: p.label, danger: p.danger });
      if (!ok) return null;
      return (await api.POST('/admin/fraud/settings/preset', { body: { preset: p.value } })).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success('Набор применён');
      void qc.invalidateQueries({ queryKey: ['fraud-settings'] });
      invalidateFraud(qc);
    },
    onError: (e) => toast.error(e),
  });
  const busy = save.isPending || preset.isPending;

  const num = (k: NumKey) => (
    <Field key={k} label={NUMS[k].label} htmlFor={`cf-${k}`} hint={NUMS[k].hint}>
      <Input
        id={`cf-${k}`}
        inputMode="numeric"
        className={cn('w-28', parsed[k] === null && 'border-danger')}
        value={raw[k]}
        disabled={!canEdit}
        onChange={(e) => setRaw((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))}
      />
    </Field>
  );
  const action = (k: 'matchAction' | 'deviceAction', title: string, hint: string) => (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3.5 py-3">
      <Field label={title} htmlFor={`cf-${k}`} hint={hint}>
        <Select
          id={`cf-${k}`}
          className="w-full max-w-72"
          value={s[k]}
          disabled={!canEdit}
          onChange={(e) => setS((x) => ({ ...x, [k]: e.target.value as FraudMatchAction }))}
        >
          {FRAUD_MATCH_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {FRAUD_MATCH_ACTION_RU[a]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );

  return (
    <>
      {confirmDialog}
      <Card className="mb-4 p-5">
        <h3 className="font-medium text-heading">Главные выключатели</h3>
        <p className="mt-1 text-sm text-muted">Всё можно выключить одним движением и включить обратно — ничего не теряется.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className={cn('flex items-start justify-between gap-4 rounded-xl px-3.5 py-3', s.enabled ? 'bg-accent-soft' : 'bg-danger-soft/40')}>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">Включено</div>
              <p className="mt-0.5 text-xs text-muted">
                {s.enabled
                  ? 'Повторные аккаунты заблокированных ловятся при входе, балл риска считается по жалобам адвокатов.'
                  : 'Выключено: никто не проверяется, очередь не пополняется.'}
              </p>
            </div>
            <Switch checked={s.enabled} onChange={(v) => setS((x) => ({ ...x, enabled: v }))} disabled={!canEdit} label="Включено" className="mt-0.5 shrink-0" />
          </div>
          <div className={cn('flex items-start justify-between gap-4 rounded-xl px-3.5 py-3', s.auto ? 'bg-accent-soft' : 'bg-surface-2')}>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">Автоматически</div>
              <p className="mt-0.5 text-xs text-muted">
                {s.auto
                  ? 'Ограничения и блокировки применяются сами по правилам ниже.'
                  : 'Выключено: никто не ограничивается и не блокируется сам — всё только попадает в очередь к сотруднику.'}
              </p>
            </div>
            <Switch checked={s.auto} onChange={(v) => setS((x) => ({ ...x, auto: v }))} disabled={!canEdit} label="Автоматически" className="mt-0.5 shrink-0" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={p.value === 'off' ? 'danger-soft' : 'outline'}
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
        <div className={cn('transition-opacity duration-300', !s.enabled && 'opacity-50')}>
          <h3 className="font-medium text-heading">Повторный аккаунт заблокированного</h3>
          <p className="mt-1 text-sm text-muted">Что делать, когда новый вход совпал с заблокированным аккаунтом. Сами значения не хранятся и не показываются — только отпечатки.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {action('matchAction', 'Тот же телефон, почта, Apple/Google или карта, что у заблокированного', 'Сильное совпадение: почти наверняка тот же человек.')}
            {action('deviceAction', 'Тот же телефон (устройство)', 'Телефон могут продать или отдать родственнику — поэтому отдельная настройка.')}
          </div>

          <h4 className="mt-6 text-sm font-medium text-heading">Балл риска</h4>
          <p className="mt-1 text-xs text-muted">
            Жалобы адвокатов, которые работали с клиентом, фальшивые контакты, chargeback и связи с заблокированными складываются в балл. Пороги должны идти
            по возрастанию.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{(['reviewScore', 'restrictScore', 'banScore'] as const).map(num)}</div>

          <h4 className="mt-6 text-sm font-medium text-heading">Сколько баллов за что</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(['weightFraudReport', 'weightReport', 'weightChargeback', 'windowDays'] as const).map(num)}</div>

          <h4 className="mt-6 text-sm font-medium text-heading">Хранение и уведомления</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {num('fingerprintRetentionDays')}
            {num('blockedRetentionDays')}
            <div className="flex min-w-0 items-start justify-between gap-4 rounded-xl bg-surface-2 px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">Уведомлять сотрудников</div>
                <p className="mt-0.5 text-xs text-muted">
                  {s.notifyStaff ? 'Верификаторы получают уведомление, когда кто-то попал в очередь.' : 'Выключено: очередь пополняется молча.'}
                </p>
              </div>
              <Switch
                checked={s.notifyStaff}
                onChange={(v) => setS((x) => ({ ...x, notifyStaff: v }))}
                disabled={!canEdit}
                label="Уведомлять сотрудников"
                className="mt-0.5 shrink-0"
              />
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {!allValid ? (
              <span className="min-w-0 text-xs text-danger">Проверьте числа: они вне допустимых границ.</span>
            ) : !ordered ? (
              <span className="min-w-0 text-xs text-danger">Пороги должны идти по возрастанию: проверка ≤ ограничение ≤ блокировка.</span>
            ) : null}
            <Button className="w-36 shrink-0" disabled={!valid || busy} loading={save.isPending} onClick={() => save.mutate()}>
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

// --- Решения ---------------------------------------------------------------

const ACTORS: { value: Actor; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'staff', label: 'Сотрудники' },
  { value: 'system', label: 'Система' },
];

function FraudEvents() {
  const [actor, setActor] = useState<Actor>('all');
  const q = useQuery({
    queryKey: ['fraud-events', actor],
    queryFn: async () => (await api.GET('/admin/fraud/events', { params: { query: { actor, limit: 200 } } })).data!.data,
  });
  const rows = q.data ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Кто решил" className="w-48" value={actor} onChange={(e) => setActor(e.target.value as Actor)}>
          {ACTORS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-faint">История неизменяема: кто, когда и почему.</span>
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Когда</Th>
            <Th>Человек</Th>
            <Th>Что</Th>
            <Th>Кто</Th>
            <Th>Балл</Th>
            <Th>Заметка</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>Решений ещё не было.</TableEmpty>
          ) : (
            rows.map((e, i) => (
              <MotionRow key={e.id} i={i}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(e.createdAt)}</Td>
                <Td className="max-w-56">
                  {e.userId ? (
                    <Link href={`/verification/trust/clients/${e.userId}`} className="block truncate font-medium text-heading hover:underline">
                      {e.userName?.trim() || `Без имени · ${e.userId.slice(0, 8)}`}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td>
                  <div className="flex max-w-64 flex-col items-start gap-1">
                    <FraudEventChip kind={e.kind} />
                    <KindChips kinds={e.kinds} />
                  </div>
                </Td>
                <Td className="max-w-48 text-xs">
                  <div className="truncate">{e.actorType === 'admin' ? (e.actorName ?? FRAUD_ACTOR_RU.admin) : (FRAUD_ACTOR_RU[e.actorType] ?? e.actorType)}</div>
                </Td>
                <Td className="tabular-nums">{e.score ?? '—'}</Td>
                <Td className="max-w-72 text-xs break-words text-muted">{e.note ?? '—'}</Td>
              </MotionRow>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}

// --- «Заблокировать» --------------------------------------------------------

export type BanResult = { note: string; includeLinked: boolean } | null;

/**
 * «Заблокировать»: a reason (3–500, required by the API) and «и все
 * связанные аккаунты». `const { askBan, dialog } = useBanDialog()`; render
 * `{dialog}` once — same promise pattern as useReason.
 */
export function useBanDialog() {
  const [state, setState] = useState<{ title: string; linked: number; resolve: (r: BanResult) => void } | null>(null);
  const askBan = useCallback(
    (title: string, linked: number) => new Promise<BanResult>((resolve) => setState({ title, linked, resolve })),
    [],
  );
  const dialog = state ? (
    <BanDialog
      title={state.title}
      linked={state.linked}
      onClose={(r) => {
        state.resolve(r);
        setState(null);
      }}
    />
  ) : null;
  return { askBan, dialog };
}

function BanDialog({ title, linked, onClose }: { title: string; linked: number; onClose: (r: BanResult) => void }) {
  const [note, setNote] = useState('');
  const [includeLinked, setIncludeLinked] = useState(false);
  const trimmed = note.trim();
  const ok = trimmed.length >= 3 && trimmed.length <= FRAUD_NOTE_MAX;
  return (
    <Dialog
      open
      onClose={() => onClose(null)}
      eyebrow="Подтверждение"
      title={title}
      description="Аккаунт приостанавливается. Его телефон, почта, Apple/Google, карта и устройство запоминаются — с ними не вернуться под новым аккаунтом."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onClose({ note: trimmed, includeLinked });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="ban-note">
            Почему блокируете<span className="ml-1 text-xs font-normal text-muted">(не короче 3 символов)</span>
          </Label>
          <Textarea id="ban-note" autoFocus rows={4} maxLength={FRAUD_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="text-right text-xs text-faint">
            {trimmed.length}/{FRAUD_NOTE_MAX}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
            checked={includeLinked}
            disabled={linked === 0}
            onChange={(e) => setIncludeLinked(e.target.checked)}
          />
          <span className="min-w-0">
            и все связанные аккаунты
            <span className="block text-xs text-muted">
              {linked > 0 ? `Связанных аккаунтов: ${linked} — общий телефон, почта, Apple/Google, карта или устройство.` : 'Связанных аккаунтов нет.'}
            </span>
          </span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" className="shrink-0" onClick={() => onClose(null)}>
            Отмена
          </Button>
          <Button type="submit" variant="danger" className="shrink-0" disabled={!ok}>
            Заблокировать
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
