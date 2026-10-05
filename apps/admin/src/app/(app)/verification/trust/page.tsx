'use client';

import { HandPalm, SealCheck, ShieldCheck, Warning } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { TRUST_NOTE_MAX } from '@/components/trust/trust-panel';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import {
  attorneyName,
  HOLD_RU,
  TRUST_LEVEL_RU,
  TRUST_LEVELS,
  trustLevelLabel,
  TrustLevelChip,
} from '@/lib/trust-labels';
import { formatDateTime } from '@/lib/utils';

type Settings = components['schemas']['TrustSettingsDto'];

/** app_config keys of the firm-link automation (not part of TrustSettingsDto). */
const FIRM_LINK_KEYS = {
  registry: 'trust.firm_link_auto_registry',
  email: 'trust.firm_link_auto_email',
} as const;

/**
 * Owner 2026-10-05 — Верификация → «Уровни доверия» (docs/ATTORNEY_TRUST.md):
 * how many attorneys sit on each level, what each level may do, the
 * automatic protections (each switchable), and the attorneys on hold.
 */
export default function TrustLevelsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canManage = me ? can(me, 'verification', 'manage') : false;
  const { confirm, dialog: confirmDialog } = useConfirm();

  const stats = useQuery({
    queryKey: ['trust-stats'],
    queryFn: async () => (await api.GET('/admin/trust/stats')).data!.data,
  });
  const settings = useQuery({
    queryKey: ['trust-settings'],
    queryFn: async () => (await api.GET('/admin/trust/settings')).data!.data,
  });
  const recomputeAll = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Пересчитать всех адвокатов?',
        description: 'Уровни всех адвокатов будут вычислены заново по текущим настройкам. Это нужно после изменения настроек.',
        confirm: 'Пересчитать',
      });
      if (!ok) return null;
      return (await api.POST('/admin/trust/recompute-all')).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(`Пересчитано: ${r.attorneys}, изменился уровень у ${r.changed}`);
      void qc.invalidateQueries({ queryKey: ['trust-stats'] });
      void qc.invalidateQueries({ queryKey: ['trust-holds'] });
      void qc.invalidateQueries({ queryKey: ['trust-card'] });
    },
    onError: (e) => toast.error(e),
  });

  const byLevel = new Map((stats.data?.byLevel ?? []).map((x) => [x.level, x.attorneys]));

  return (
    <>
      {confirmDialog}
      <PageHeader
        eyebrow="Люди · Верификация"
        title="Уровни доверия"
        subtitle="Простая регистрация остаётся: адвокат называет штат и номер под присягой. Но что LawBid показывает клиенту и что разрешает адвокату — зависит от уровня, который растёт только с проверками, не зависящими от слов адвоката."
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
          TRUST_LEVELS.map((lvl) => (
            <Kpi
              key={lvl}
              i={lvl}
              icon={lvl === 3 ? ShieldCheck : SealCheck}
              title={trustLevelLabel(lvl)}
              value={byLevel.get(lvl) ?? 0}
              hint={TRUST_LEVEL_RU[lvl].hint}
              gold={lvl === 3}
            />
          ))
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {stats.isPending ? (
          <KpiSkeletons n={3} />
        ) : stats.data ? (
          <>
            <Kpi i={4} icon={HandPalm} title="На холде" value={stats.data.held} hint="платежи или ставки приостановлены" warn />
            <Kpi i={5} icon={SealCheck} title="С галочкой" value={stats.data.withBadge} hint={`верифицированных всего: ${stats.data.verified}`} />
            <Kpi i={6} icon={Warning} title="Жалоб за 30 дней" value={stats.data.complaints30d} hint="мошенничество, самозванец" warn />
          </>
        ) : null}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <SectionTitle>Настройки</SectionTitle>
      {settings.isPending ? (
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" />
      ) : settings.data ? (
        <SettingsForm key={JSON.stringify(settings.data)} initial={settings.data} canEdit={canManage} />
      ) : (
        <ErrorNote text={settings.error ? errorText(settings.error) : 'Не удалось загрузить настройки'} />
      )}

      <FirmLinkAutomation />

      <SectionTitle>На холде</SectionTitle>
      <Holds canManage={canManage} />
    </>
  );
}

const LEVEL_OPTIONS = TRUST_LEVELS.map((l) => (
  <option key={l} value={l}>
    {trustLevelLabel(l)}
  </option>
));

function SettingsForm({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
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
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const num = (v: string) => Number(v) as number;

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
      toast.success('Настройки сохранены. Нажмите «Пересчитать всех», чтобы применить к текущим адвокатам.');
      void qc.invalidateQueries({ queryKey: ['trust-settings'] });
    },
    onError: (e) => toast.error(e),
  });

  const toggle = (k: 'autoHoldOnComplaint' | 'autoHoldOnNameMismatch' | 'flagDuplicateClaims', title: string, on: string, off: string) => (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-surface-2 px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-xs text-muted">{s[k] ? on : off}</p>
      </div>
      <Switch checked={s[k]} onChange={(v) => set(k, v)} disabled={!canEdit} label={title} className="mt-0.5" />
    </div>
  );

  return (
    <Card className="p-5">
      <h3 className="font-medium text-heading">Что можно на каждом уровне</h3>
      <p className="mt-1 text-sm text-muted">
        Уровни: 0 «Заявлен» — только присяга; 1 «Реестр» — номер подтверждён реестром штата или сотрудником; 2 «Личность» — Stripe KYC с совпавшим именем или
        подтверждённая связь с фирмой; 3 «Документы» — сотрудник проверил карточку и удостоверение плюс личность по Stripe.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Ставки и чат с клиентом" htmlFor="ts-bids" hint="минимальный уровень, чтобы откликаться на кейсы">
          <Select id="ts-bids" value={s.minLevelBids} disabled={!canEdit} onChange={(e) => set('minLevelBids', num(e.target.value))}>
            {LEVEL_OPTIONS}
          </Select>
        </Field>
        <Field label="Оплата через LawBid" htmlFor="ts-pay" hint="минимальный уровень, чтобы получать деньги клиентов и выставлять счета">
          <Select id="ts-pay" value={s.minLevelPayments} disabled={!canEdit} onChange={(e) => set('minLevelPayments', num(e.target.value))}>
            {LEVEL_OPTIONS}
          </Select>
        </Field>
        <Field label="Синяя галочка" htmlFor="ts-badge" hint="минимальный уровень, с которого в приложении показывается галочка">
          <Select id="ts-badge" value={s.minLevelBadge} disabled={!canEdit} onChange={(e) => set('minLevelBadge', num(e.target.value))}>
            {LEVEL_OPTIONS}
          </Select>
        </Field>
      </div>

      <h4 className="mt-6 text-sm font-medium text-heading">Задержка выплат Stripe</h4>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label="Задержка, дней" htmlFor="ts-payout" hint="0–30; 0 — стандартный график Stripe. Деньги клиента ждут на балансе, пока адвокат не дорос до уровня справа.">
          <Input id="ts-payout" inputMode="numeric" value={payout} disabled={!canEdit} onChange={(e) => setPayout(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="До уровня" htmlFor="ts-payout-lvl" hint="адвокаты ниже этого уровня получают выплаты с задержкой">
          <Select id="ts-payout-lvl" value={s.payoutDelayUntilLevel} disabled={!canEdit} onChange={(e) => set('payoutDelayUntilLevel', num(e.target.value))}>
            {LEVEL_OPTIONS}
          </Select>
        </Field>
      </div>

      <h4 className="mt-6 text-sm font-medium text-heading">Автоматические защиты</h4>
      <p className="mt-1 text-xs text-muted">Каждую можно выключить отдельно; выключенная защита ничего не делает сама — решает верификатор вручную.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {toggle(
          'autoHoldOnComplaint',
          'Холд при жалобе на мошенничество',
          'Включено: жалоба клиента «мошенничество» или «самозванец» сразу ставит холд на платежи и новые ставки до проверки верификатором.',
          'Выключено: жалоба попадает в очередь модерации, адвокат продолжает работать, пока админ не поставит холд вручную.',
        )}
        {toggle(
          'autoHoldOnNameMismatch',
          'Холд при несовпадении имени в Stripe',
          'Включено: если юридическое имя из Stripe KYC не совпало с профилем и реестром — платежи ставятся на холд и у адвоката запрашиваются документы.',
          'Выключено: несовпадение только отмечается в карточке; платежи продолжаются.',
        )}
        {toggle(
          'flagDuplicateClaims',
          'Отмечать повторные заявки номера',
          'Включено: когда кто-то регистрируется с уже занятым номером лицензии, лицензия владельца помечается для сверки с реестром («Сверка с реестром»).',
          'Выключено: повторная заявка просто отклоняется, без отметки у владельца номера.',
        )}
        <div className="rounded-xl bg-surface-2 px-3.5 py-3">
          <div className="text-sm font-medium text-ink">Автоприостановка по жалобам</div>
          <p className="mt-0.5 text-xs text-muted">
            Столько разных клиентов пожаловались за окно — профиль приостанавливается до разбора.
          </p>
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

      {canEdit ? (
        <div className="mt-5 flex items-center justify-end gap-3">
          {!valid ? <span className="text-xs text-danger">Проверьте числа: они вне допустимых границ.</span> : null}
          <Button className="w-36" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Сохранить
          </Button>
        </div>
      ) : (
        <p className="mt-5 text-xs text-faint">Менять настройки может верификатор с правом «управление» или супер-админ.</p>
      )}
    </Card>
  );
}

/**
 * The two firm-link automations live in app_config (area «settings»), not in
 * TrustSettingsDto: shown as switches when the admin may open /config, as a
 * pointer otherwise.
 */
function FirmLinkAutomation() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canSee = me ? can(me, 'settings') : false;
  const canEdit = me ? can(me, 'settings', 'manage') : false;
  const q = useQuery({
    queryKey: ['config'],
    enabled: canSee,
    queryFn: async () => (await api.GET('/admin/config')).data!.data as { key: string; value: unknown }[],
  });
  const put = useMutation({
    mutationFn: (v: { key: string; value: boolean }) =>
      api.PUT('/admin/config/{key}', { params: { path: { key: v.key } }, body: { value: v.value } as never }),
    onSuccess: () => {
      toast.success('Сохранено');
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => toast.error(e),
  });
  const value = (key: string) => q.data?.find((e) => e.key === key)?.value === true;

  const row = (key: string, title: string, on: string, off: string) => {
    const v = value(key);
    return (
      <div key={key} className="flex items-start justify-between gap-4 rounded-xl bg-surface-2 px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{title}</div>
          <p className="mt-0.5 text-xs text-muted">{canSee && q.data ? (v ? on : off) : `${on} Ключ ${key} на странице «Настройки».`}</p>
        </div>
        {canSee && q.data ? (
          <Switch checked={v} disabled={!canEdit || put.isPending} onChange={(x) => put.mutate({ key, value: x })} label={title} className="mt-0.5" />
        ) : (
          <Badge tone="neutral" className="mt-0.5">
            настройки
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Card className="mt-4 p-5">
      <h4 className="text-sm font-medium text-heading">Связь с фирмой (аккаунт Stripe компании)</h4>
      <p className="mt-1 text-xs text-muted">
        Если Stripe-аккаунт оформлен на компанию, где адвокат не владелец и не представитель, его личность засчитывается только после подтверждения связи с
        этой фирмой: автоматически одним из способов ниже или верификатором по письму на бланке фирмы.
        {!canSee ? (
          <>
            {' '}
            Переключатели доступны тем, кто открывает{' '}
            <Link href="/config" className="text-gold-600 hover:underline">
              Система → Настройки
            </Link>
            .
          </>
        ) : null}
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {row(
          FIRM_LINK_KEYS.registry,
          'Связь по реестру штата',
          'Включено: если фирма в реестре штата совпадает с названием компании в Stripe, связь подтверждается сама.',
          'Выключено: совпадение с реестром не засчитывается — нужен e-mail фирмы или подтверждение верификатора.',
        )}
        {row(
          FIRM_LINK_KEYS.email,
          'Связь по e-mail фирмы',
          'Включено: адвокат подтверждает адрес на домене сайта компании из Stripe кодом из письма — связь засчитывается сама.',
          'Выключено: e-mail не засчитывается — только реестр или верификатор.',
        )}
      </div>
    </Card>
  );
}

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
      void qc.invalidateQueries({ queryKey: ['trust-holds'] });
      void qc.invalidateQueries({ queryKey: ['trust-stats'] });
      void qc.invalidateQueries({ queryKey: ['trust-card'] });
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data ?? [];
  const cols = canManage ? 7 : 6;

  return (
    <>
      {dialog}
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Адвокаты, у которых приостановлены платежи или новые ставки — автоматически (жалоба, несовпадение имени, чужая заявка на номер) или администратором.
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
              const codes = [r.holds.payments, r.holds.bids].filter((x): x is string => Boolean(x));
              const reasons = [...new Set(codes)];
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
