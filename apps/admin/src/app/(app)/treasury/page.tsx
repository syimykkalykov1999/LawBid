'use client';

import { ArrowsSplit, Bank, CheckCircle, Plus, ShieldCheck, Trash, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { UpdatedAgo } from '@/components/updated-ago';
import { ApiError, api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { centsToInput, money, parseDollars } from '@/lib/payroll';
import { can } from '@/lib/rbac';
import {
  bankText,
  COST_LINE_LABEL,
  months,
  PAYOUT_KIND,
  PAYOUT_STATUS,
  setupSteps,
  type TreasuryOverview,
} from '@/lib/treasury';
import { formatDateTime } from '@/lib/utils';

type Settings = components['schemas']['UpdateTreasurySettingsDto'];
type Pending = { kind: 'settings'; body: Settings } | { kind: 'run' };
type ExpenseAction =
  | { op: 'add'; name: string; monthlyCents: number }
  | { op: 'edit'; id: string; monthlyCents?: number; active?: boolean }
  | { op: 'delete'; id: string };

const dateOnly = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso));

/**
 * Owner 2026-10-05 «на карту — только чистая прибыль»: Деньги → «Прибыль
 * и резерв». Once a month the system splits the Stripe balance by itself:
 * a month of expenses to the expense bank, the reserve stays on Stripe,
 * the rest to the owner's bank. Banks are only the ones in Stripe itself.
 */
export default function TreasuryPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = can(me, 'money', 'manage');
  const q = useQuery({
    queryKey: ['treasury'],
    queryFn: async () => (await api.GET('/admin/treasury')).data!.data,
  });
  const set = (t: TreasuryOverview) => qc.setQueryData(['treasury'], t);
  const t = q.data;

  const [stepUp, setStepUp] = useState<Pending | null>(null);
  const guarded = useMutation({
    mutationFn: async (p: Pending) => {
      if (p.kind === 'settings') {
        set((await api.PUT('/admin/treasury/settings', { body: p.body })).data!.data);
        return null;
      }
      return (await api.POST('/admin/treasury/run')).data!.data;
    },
    onSuccess: (r, p) => {
      if (p.kind === 'settings') {
        toast.success('Сохранено');
        return;
      }
      void qc.invalidateQueries({ queryKey: ['treasury'] });
      if (!r) return;
      if (r.skipped === 'not_manual') toast.error('Сначала поставьте выплаты в Stripe на Manual');
      else if (r.skipped === 'no_stripe') toast.error('Сначала сохраните ключи Stripe');
      else if (r.skipped === 'busy') toast.error('Деление уже идёт, обновите страницу через минуту');
      else if (r.expensesCents + r.profitCents === 0) toast.success('Делить нечего: всё нужно на запас');
      else toast.success(`Отправлено: расходы ${money(r.expensesCents)}, прибыль ${money(r.profitCents)}`);
    },
    onError: (e, p) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(p);
      else toast.error(e);
    },
  });

  const expense = useMutation({
    mutationFn: async (a: ExpenseAction) => {
      if (a.op === 'add') {
        const body = { name: a.name, monthlyCents: a.monthlyCents };
        return (await api.POST('/admin/treasury/expenses', { body })).data!.data;
      }
      const path = { id: a.id };
      if (a.op === 'edit') {
        const body = { monthlyCents: a.monthlyCents, active: a.active };
        return (await api.PATCH('/admin/treasury/expenses/{id}', { params: { path }, body })).data!.data;
      }
      return (await api.DELETE('/admin/treasury/expenses/{id}', { params: { path } })).data!.data;
    },
    onSuccess: (data) => {
      set(data);
      toast.success('Сохранено');
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Прибыль и резерв"
        subtitle="Раз в месяц система сама делит деньги на Stripe: на счёт «Расходы» — сколько нужно на сервисы и зарплаты, запас остаётся в Stripe, остальное — ваша прибыль на основной банк."
        actions={t ? <UpdatedAgo at={q.dataUpdatedAt} /> : null}
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />

      {!t ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <SetupCard t={t} />

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <Card className="flex min-w-0 flex-col gap-1 p-5">
              <span className="text-[13px] text-muted">На балансе Stripe</span>
              <span className="text-2xl font-semibold text-heading">
                {t.availableCents === null ? '—' : money(t.availableCents)}
              </span>
              <span className="text-xs text-muted">
                {t.pendingCents ? `Ещё в пути от клиентов: ${money(t.pendingCents)}` : 'Комиссия Stripe уже вычтена'}
              </span>
            </Card>
            <Card className="flex min-w-0 flex-col gap-1 p-5">
              <span className="text-[13px] text-muted">Остаётся в Stripe как запас</span>
              <span className="text-2xl font-semibold text-heading">{money(t.plan.reserveTargetCents)}</span>
              <span className="text-xs text-muted">
                Все расходы в месяц: {money(t.plan.monthlyCostCents)}. После деления запаса хватит на{' '}
                {months(t.plan.coverMonths)}
              </span>
            </Card>
            <Card className="flex min-w-0 flex-col gap-1 p-5">
              <span className="text-[13px] text-muted">{t.settings.auto ? 'Следующее деление' : 'Деление вручную'}</span>
              <span className="text-2xl font-semibold text-heading">
                {t.settings.auto ? dateOnly(t.nextRunAt) : 'кнопкой ниже'}
              </span>
              <span className="break-words text-xs text-muted">
                Если делить сейчас: расходы {money(t.plan.expensePayoutCents)}, прибыль{' '}
                {money(t.plan.profitPayoutCents)}
                {t.plan.heldProfitCents > 0 ? ` (${money(t.plan.heldProfitCents)} подождёт: меньше минимума)` : ''}
              </span>
            </Card>
          </div>

          {t.plan.shortfallCents > 0 ? (
            <Card className="mb-6 flex items-start gap-3 p-4">
              <WarningCircle size={20} className="mt-0.5 shrink-0 text-warning" />
              <p className="min-w-0 break-words text-sm text-ink">
                Пока на Stripe не хватает {money(t.plan.shortfallCents)} на месяц расходов и запас. Сначала
                оплачиваются расходы, прибыль подождёт. Если на карте для расходов мало денег, пополните её один раз
                сами.
              </p>
            </Card>
          ) : null}

          <SectionTitle>Куда идут деньги</SectionTitle>
          <Card className="mb-6 divide-y divide-line">
            <BankRow
              title="Прибыль"
              hint="Основной банк в Stripe (ваша карта)"
              value={bankText(t.profitBank, 'Основной банк в Stripe')}
              gold
            />
            <BankRow
              title="Расходы"
              hint="Второй банк в Stripe, его карта платит за сервисы"
              value={bankText(t.expenseBank, 'Нет второго банка: пока туда же, на основной')}
            />
            <div className="flex items-start gap-2 p-4 text-xs text-muted">
              <ShieldCheck size={16} className="mt-px shrink-0 text-success" />
              <span className="min-w-0 break-words">
                Банк нельзя добавить или поменять в админке, только в самом Stripe под вашим паролем и 2FA. Поэтому
                даже с паролем от админки никто не уведёт деньги. Если банки в Stripe поменяются, придёт письмо.
              </span>
            </div>
          </Card>

          <SectionTitle>Расходы в месяц</SectionTitle>
          <ExpensesCard t={t} canWrite={canWrite} busy={expense.isPending} onChange={(a) => expense.mutate(a)} />

          <SectionTitle>Настройки</SectionTitle>
          <SettingsCard
            t={t}
            canWrite={canWrite}
            busy={guarded.isPending && guarded.variables?.kind === 'settings'}
            onSave={(body) => guarded.mutate({ kind: 'settings', body })}
          />

          <SectionTitle>Поделить сейчас</SectionTitle>
          <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
            <p className="min-w-0 flex-1 basis-64 break-words text-sm text-muted">
              Отправляет те же суммы, что посчитаны выше: расходы не чаще раза в месяц, прибыль только сверх запаса.
              Нужен код 2FA.
            </p>
            <Button
              variant="outline"
              disabled={!canWrite || !t.setup.manualPayouts}
              loading={guarded.isPending && guarded.variables?.kind === 'run'}
              onClick={() => guarded.mutate({ kind: 'run' })}
            >
              <ArrowsSplit size={16} /> Поделить сейчас
            </Button>
          </Card>

          <SectionTitle>История выплат</SectionTitle>
          <PayoutsTable t={t} />
        </>
      )}

      <StepUpDialog
        open={stepUp !== null}
        description="Это меняет, как делятся деньги. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const p = stepUp;
          setStepUp(null);
          if (p) guarded.mutate(p);
        }}
      />
    </>
  );
}

function SetupCard({ t }: { t: TreasuryOverview }) {
  const steps = setupSteps(t.setup);
  if (steps.every((s) => s.done)) return null;
  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 text-sm font-medium text-heading">Один раз настроить в Stripe (бесплатно)</div>
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.title} className="flex items-start gap-2">
            {s.done ? (
              <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-success" />
            ) : (
              <WarningCircle size={18} className="mt-px shrink-0 text-warning" />
            )}
            <div className="min-w-0">
              <div className="text-sm text-ink">{s.title}</div>
              {!s.done ? <div className="break-words text-xs text-muted">{s.todo}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function BankRow({ title, hint, value, gold }: { title: string; hint: string; value: string; gold?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <Bank size={18} className={gold ? 'shrink-0 text-gold-600' : 'shrink-0 text-muted'} />
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-sm font-medium text-heading">{title}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <span className="min-w-0 break-words text-sm text-ink">{value}</span>
    </div>
  );
}

function ExpensesCard({
  t,
  canWrite,
  busy,
  onChange,
}: {
  t: TreasuryOverview;
  canWrite: boolean;
  busy: boolean;
  onChange: (a: ExpenseAction) => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const cents = parseDollars(amount, { allowZero: true });
  return (
    <Card className="mb-6 divide-y divide-line">
      <div className="p-4 text-xs text-muted">
        Сколько сервисы списывают с карты для расходов за месяц. Суммы примерные, поправьте, если знаете точнее: с
        запасом {t.settings.bufferPercent}% ошибка не страшна. Для AWS система сама берёт его прогноз, если он выше.
      </div>
      {t.expenses.map((e) => (
        <ExpenseRow key={e.id} e={e} canWrite={canWrite} busy={busy} onChange={onChange} />
      ))}
      {t.costLines
        .filter((l) => l.monthlyCents > 0)
        .map((l) => (
          <div key={l.key} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 basis-48">
              <div className="text-sm text-ink">{COST_LINE_LABEL[l.key]}</div>
              <div className="text-xs text-muted">
                {l.via === 'stripe' ? 'Остаётся в Stripe' : 'Уходит на счёт «Расходы»'}, считается само
              </div>
            </div>
            <span className="text-sm text-ink">{money(l.monthlyCents)}</span>
          </div>
        ))}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1 text-sm font-medium text-heading">Итого в месяц</div>
        <span className="text-sm font-medium text-heading">{money(t.plan.monthlyCostCents)}</span>
      </div>
      {canWrite ? (
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Сервис" className="min-w-0 flex-1 basis-48">
            <Input
              value={name}
              maxLength={80}
              placeholder="Например, Google Workspace"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="$ в месяц" className="w-32">
            <Input value={amount} inputMode="decimal" placeholder="10" onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Button
            variant="outline"
            disabled={busy || name.trim().length < 2 || cents === null}
            onClick={() => {
              if (cents === null) return;
              onChange({ op: 'add', name: name.trim(), monthlyCents: cents });
              setName('');
              setAmount('');
            }}
          >
            <Plus size={16} /> Добавить
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function ExpenseRow({
  e,
  canWrite,
  busy,
  onChange,
}: {
  e: TreasuryOverview['expenses'][number];
  canWrite: boolean;
  busy: boolean;
  onChange: (a: ExpenseAction) => void;
}) {
  const [value, setValue] = useState(centsToInput(e.monthlyCents));
  useEffect(() => setValue(centsToInput(e.monthlyCents)), [e.monthlyCents]);
  const save = () => {
    const c = parseDollars(value, { allowZero: true });
    if (c === null) setValue(centsToInput(e.monthlyCents));
    else if (c !== e.monthlyCents) onChange({ op: 'edit', id: e.id, monthlyCents: c });
  };
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 basis-48">
        <div className={e.active ? 'break-words text-sm text-ink' : 'break-words text-sm text-muted line-through'}>
          {e.name}
        </div>
        {e.source === 'aws' && e.effectiveCents > e.monthlyCents ? (
          <div className="text-xs text-muted">По прогнозу AWS в этом месяце: {money(e.effectiveCents)}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted">$</span>
        <Input
          className="w-24"
          value={value}
          inputMode="decimal"
          disabled={!canWrite || busy}
          aria-label={`${e.name}: в месяц`}
          onChange={(ev) => setValue(ev.target.value)}
          onBlur={save}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') save();
          }}
        />
      </div>
      <Switch
        label={`${e.name}: учитывать`}
        checked={e.active}
        disabled={!canWrite || busy}
        onChange={(v) => onChange({ op: 'edit', id: e.id, active: v })}
      />
      {canWrite ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Удалить ${e.name}`}
          disabled={busy}
          onClick={() => onChange({ op: 'delete', id: e.id })}
        >
          <Trash size={16} />
        </Button>
      ) : null}
    </div>
  );
}

const int = (v: string, lo: number, hi: number) => {
  const n = Number(v);
  return v.trim() !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

function SettingsCard({
  t,
  canWrite,
  busy,
  onSave,
}: {
  t: TreasuryOverview;
  canWrite: boolean;
  busy: boolean;
  onSave: (body: Settings) => void;
}) {
  const s = t.settings;
  const [day, setDay] = useState(String(s.payoutDay));
  const [buffer, setBuffer] = useState(String(s.bufferPercent));
  const [refund, setRefund] = useState(String(s.refundBufferUsd));
  const [minProfit, setMinProfit] = useState(String(s.minProfitUsd));
  useEffect(() => {
    setDay(String(s.payoutDay));
    setBuffer(String(s.bufferPercent));
    setRefund(String(s.refundBufferUsd));
    setMinProfit(String(s.minProfitUsd));
  }, [s.payoutDay, s.bufferPercent, s.refundBufferUsd, s.minProfitUsd]);
  const payoutDay = int(day, 1, 28);
  const bufferPercent = int(buffer, 0, 300);
  const refundBufferUsd = int(refund, 0, 100_000);
  const minProfitUsd = int(minProfit, 0, 100_000);
  const changed =
    payoutDay !== s.payoutDay ||
    bufferPercent !== s.bufferPercent ||
    refundBufferUsd !== s.refundBufferUsd ||
    minProfitUsd !== s.minProfitUsd;
  return (
    <Card className="mb-6 divide-y divide-line">
      <div className="flex items-start gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-heading">Делить само каждый месяц</div>
          <div className="mt-0.5 text-xs text-muted">Выключите, если хотите делить только кнопкой. Нужен код 2FA.</div>
        </div>
        <Switch
          label="Делить само каждый месяц"
          checked={s.auto}
          disabled={!canWrite || busy}
          onChange={(v) => onSave({ auto: v })}
        />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="День месяца" hint="1–28. 25-е: деньги на счёте до новых счетов">
          <Input value={day} inputMode="numeric" disabled={!canWrite} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Запас, % от месяца" hint="Подушка на плохой месяц">
          <Input value={buffer} inputMode="numeric" disabled={!canWrite} onChange={(e) => setBuffer(e.target.value)} />
        </Field>
        <Field label="На возвраты, $" hint="Всегда остаётся в Stripe">
          <Input value={refund} inputMode="numeric" disabled={!canWrite} onChange={(e) => setRefund(e.target.value)} />
        </Field>
        <Field label="Мин. прибыль, $" hint="Меньше — ждёт следующего месяца">
          <Input
            value={minProfit}
            inputMode="numeric"
            disabled={!canWrite}
            onChange={(e) => setMinProfit(e.target.value)}
          />
        </Field>
      </div>
      {canWrite ? (
        <div className="flex justify-end p-4">
          <Button
            disabled={
              !changed || payoutDay === null || bufferPercent === null || refundBufferUsd === null || minProfitUsd === null
            }
            loading={busy}
            onClick={() => {
              if (payoutDay === null || bufferPercent === null || refundBufferUsd === null || minProfitUsd === null) return;
              onSave({ payoutDay, bufferPercent, refundBufferUsd, minProfitUsd });
            }}
          >
            Сохранить
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function PayoutsTable({ t }: { t: TreasuryOverview }) {
  return (
    <Card className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            <Th>Когда</Th>
            <Th>Куда</Th>
            <Th>Сумма</Th>
            <Th>Статус</Th>
          </tr>
        </thead>
        <tbody>
          {t.payouts.length === 0 ? (
            <TableEmpty colSpan={4}>Выплат ещё не было</TableEmpty>
          ) : (
            t.payouts.map((p) => {
              const st = PAYOUT_STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const };
              return (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(p.createdAt)}</Td>
                  <Td>
                    <div className="text-sm text-ink">
                      {PAYOUT_KIND[p.kind] ?? p.kind}
                      {p.trigger === 'manual' ? ', вручную' : ''}
                    </div>
                    <div className="break-words text-xs text-muted">{p.destinationLabel ?? 'Основной банк'}</div>
                  </Td>
                  <Td className="whitespace-nowrap">{money(p.amountCents)}</Td>
                  <Td>
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                    {p.failure ? <div className="mt-1 break-words text-xs text-danger">{p.failure}</div> : null}
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </Card>
  );
}
