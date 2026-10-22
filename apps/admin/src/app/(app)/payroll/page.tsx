'use client';

import { CheckCircle, Coins, DownloadSimple, LinkSimple, Money, Plus, UsersThree, Wallet, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CopyButton } from '@/components/billing/shared';
import { Kpi } from '@/components/billing/kpi';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import {
  ACCRUAL_KIND,
  ACCRUAL_STATUS,
  centsToInput,
  currentPeriod,
  downloadCsv,
  money,
  parseDollars,
  PAYOUT_METHOD,
  PAYOUT_STATUS,
  stripeFee,
  type StripeFees,
  toCsv,
  totalsByCurrency,
  totalsText,
} from '@/lib/payroll';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type Employee = components['schemas']['PayrollEmployeeDto'];
type Payout = components['schemas']['PayrollPayoutDto'];
type Accrual = components['schemas']['PayrollAccrualDto'];
type Method = NonNullable<components['schemas']['PayrollBulkPayDto']['method']>;

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  paid: 'success',
  processing: 'warning',
  failed: 'danger',
  canceled: 'neutral',
};

/**
 * Owner 2026-10-05 — Деньги → Зарплаты. The people on payroll with a fixed
 * monthly amount; select some (or all) and «Выплатить» for a period with a
 * calculator; history with cancel and CSV. Seen by the super admin, the
 * trusted deputy and admins given the «Зарплаты» area.
 */
export default function PayrollPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = can(me, 'payroll', 'manage');
  const { ask, dialog: reasonDialog } = useReason();
  const [period, setPeriod] = useState(currentPeriod());
  const [showInactive, setShowInactive] = useState(false);
  const [allPeriods, setAllPeriods] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [paying, setPaying] = useState(false);
  const [link, setLink] = useState<{
    name: string;
    url: string;
    ready: boolean;
  } | null>(null);
  const [extras, setExtras] = useState<Employee | null>(null);

  const employees = useQuery({
    queryKey: ['payroll-employees', showInactive],
    queryFn: async () =>
      (
        await api.GET('/admin/payroll/employees', {
          params: { query: { includeInactive: showInactive } },
        })
      ).data!.data,
  });
  const summary = useQuery({
    queryKey: ['payroll-summary', period],
    queryFn: async () =>
      (
        await api.GET('/admin/payroll/summary', {
          params: { query: { period } },
        })
      ).data!.data,
  });
  const periodPayouts = useQuery({
    queryKey: ['payroll-payouts', period],
    queryFn: async () =>
      (
        await api.GET('/admin/payroll/payouts', {
          params: { query: { period } },
        })
      ).data!.data,
  });
  const allPayouts = useQuery({
    queryKey: ['payroll-payouts', 'all'],
    enabled: allPeriods,
    queryFn: async () => (await api.GET('/admin/payroll/payouts', { params: { query: {} } })).data!.data,
  });
  const payouts = allPeriods ? allPayouts : periodPayouts;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['payroll-employees'] });
    void qc.invalidateQueries({ queryKey: ['payroll-summary'] });
    void qc.invalidateQueries({ queryKey: ['payroll-payouts'] });
    void qc.invalidateQueries({ queryKey: ['payroll-accruals'] });
  };

  const rows = employees.data ?? [];
  const active = rows.filter((e) => e.active);
  const paidNow = new Set(
    (periodPayouts.data ?? []).filter((p) => p.status === 'paid' || p.status === 'processing').map((p) => p.employeeId),
  );
  const stripeOn = summary.data?.stripeAvailable ?? false;
  const stripePaidNow = new Set(
    (periodPayouts.data ?? [])
      .filter((p) => p.method === 'stripe' && (p.status === 'paid' || p.status === 'processing'))
      .map((p) => p.employeeId),
  );
  /** Something to pay: the salary for the period, or pending commissions. */
  const owed = (e: Employee) => e.active && ((!paidNow.has(e.id) && e.amountCents > 0) || e.pendingCents > 0);
  const unpaidActive = active.filter(owed).map((e) => e.id);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const stripeLink = useMutation({
    mutationFn: async (e: Employee) => ({
      e,
      r: (
        await api.POST('/admin/payroll/employees/{id}/stripe-link', {
          params: { path: { id: e.id } },
        })
      ).data!.data,
    }),
    onSuccess: ({ e, r }) => {
      setLink({ name: e.name, url: r.url, ready: r.payoutsEnabled });
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const setActive = (e: Employee, value: boolean) =>
    api
      .PATCH('/admin/payroll/employees/{id}', {
        params: { path: { id: e.id } },
        body: { active: value },
      })
      .then(() => {
        toast.success(value ? `${e.name}: снова в списке` : `${e.name}: снят(а) с зарплаты, история сохранена`);
        refresh();
      })
      .catch((err: unknown) => toast.error(err));

  const cancel = async (p: Payout) => {
    const r = await ask({
      title: `Отменить выплату ${money(p.amountCents, p.currency)} — ${p.employeeName}?`,
      description:
        p.method === 'stripe' && p.status === 'paid'
          ? 'Деньги вернутся со Stripe-счёта сотрудника, если он ещё не вывел их в банк. Причина попадёт в журнал аудита.'
          : 'Запись останется в истории как отменённая. Причина попадёт в журнал аудита.',
      label: 'Причина',
      min: 10,
      max: 500,
      confirm: 'Отменить выплату',
      danger: true,
    });
    if (!r) return;
    api
      .POST('/admin/payroll/payouts/{id}/cancel', {
        params: { path: { id: p.id } },
        body: { reason: r.text },
      })
      .then(() => {
        toast.success('Выплата отменена');
        refresh();
      })
      .catch((e: unknown) => toast.error(e));
  };

  const exportCsv = () => {
    const list = payouts.data ?? [];
    downloadCsv(
      `lawbid-payroll-${allPeriods ? 'all' : period}.csv`,
      toCsv(
        [
          'date',
          'employee',
          'period',
          'gross',
          'salary',
          'commissions',
          'stripe_fee',
          'net',
          'currency',
          'method',
          'status',
          'note',
          'transfer_id',
          'cancel_reason',
        ],
        list.map((p) => [
          p.createdAt,
          p.employeeName,
          p.period,
          (p.amountCents / 100).toFixed(2),
          (p.baseCents / 100).toFixed(2),
          (p.commissionCents / 100).toFixed(2),
          (p.feeCents / 100).toFixed(2),
          ((p.netCents || p.amountCents) / 100).toFixed(2),
          p.currency.toUpperCase(),
          p.method,
          p.status,
          p.note,
          p.transferId,
          p.cancelReason,
        ]),
      ),
    );
  };

  const s = summary.data;
  const cols = canWrite ? 8 : 6;
  return (
    <>
      {reasonDialog}
      <PageHeader
        eyebrow="Деньги"
        title="Зарплаты"
        subtitle="Оклад в месяц (можно 0), комиссии за привлечённых адвокатов и клиентов, бонусы. Отметьте людей и нажмите «Выплатить»: оклад платится раз за период, начисления добавляются к выплате. Через Stripe его комиссия вычитается из выплаты сотрудника. Каждое действие видно в журнале аудита."
        actions={
          <>
            <Input
              type="month"
              className="w-44"
              aria-label="Период"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value || currentPeriod());
                setSelected(new Set());
              }}
            />
            {canWrite ? (
              <Button onClick={() => setEditing('new')}>
                <Plus size={16} weight="light" /> Сотрудник
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorNote text={employees.error ? errorText(employees.error) : summary.error ? errorText(summary.error) : null} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi i={0} icon={UsersThree} title="Сотрудников" value={s?.activeEmployees ?? 0} />
        <Kpi i={1} icon={Wallet} title="Оклады в месяц" value={s?.monthly.usd ?? 0} format={(n) => money(n)} gold />
        <Kpi i={2} icon={Coins} title="Начислено, ждёт выплаты" value={s?.pending.usd ?? 0} format={(n) => money(n)} />
        <Kpi i={3} icon={CheckCircle} title={`Выплачено за ${period}`} value={s?.paid.usd ?? 0} format={(n) => money(n)} />
        <Kpi i={4} icon={WarningCircle} title="Оклад ещё не выплачен" value={s?.unpaidEmployees ?? 0} warn />
      </div>

      <SectionTitle
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <Switch checked={showInactive} onChange={setShowInactive} label="Показать снятых" /> Показать снятых
            </label>
            {canWrite ? (
              <>
                <Button size="sm" variant="outline" disabled={unpaidActive.length === 0} onClick={() => setSelected(new Set(unpaidActive))}>
                  Выбрать всех, кому должны
                </Button>
                <Button size="sm" variant="gold" disabled={selected.size === 0} onClick={() => setPaying(true)}>
                  <Money size={14} /> Выплатить ({selected.size})
                </Button>
              </>
            ) : null}
          </div>
        }
      >
        Сотрудники
      </SectionTitle>
      {!employees.isPending && rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Пока никого"
          text="Добавьте сотрудника и его оклад. Партнёры по привлечению появятся здесь сами с первой комиссией."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              {canWrite ? <Th className="w-8" /> : null}
              <Th>Сотрудник</Th>
              <Th className="text-right">Оклад</Th>
              <Th className="text-right">Начислено</Th>
              <Th>Как платим</Th>
              <Th>За {period}</Th>
              <Th>Последняя выплата</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {employees.isPending ? (
              <TableEmpty colSpan={cols} loading />
            ) : (
              rows.map((e) => (
                <tr key={e.id} className={e.active ? undefined : 'opacity-60'}>
                  {canWrite ? (
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${e.name}`}
                        className="h-4 w-4 accent-gold"
                        disabled={!owed(e)}
                        checked={selected.has(e.id)}
                        onChange={() => toggle(e.id)}
                      />
                    </Td>
                  ) : null}
                  <Td>
                    <div className="font-medium text-ink">{e.name}</div>
                    <div className="text-xs text-faint">
                      {e.roleTitle || '—'}
                      {e.active ? '' : ' · снят(а) с зарплаты'}
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{e.amountCents > 0 ? money(e.amountCents, e.currency) : '—'}</Td>
                  <Td className="text-right tabular-nums">
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      title="Комиссии и бонусы"
                      onClick={() => setExtras(e)}
                    >
                      {e.pendingCents !== 0 ? money(e.pendingCents, e.currency) : '—'}
                    </button>
                  </Td>
                  <Td className="text-xs text-muted">
                    {e.methodNote || '—'}
                    {e.stripePayoutsEnabled ? (
                      <div className="mt-1">
                        <Badge tone="success">Stripe: счёт привязан</Badge>
                      </div>
                    ) : e.stripeLinked ? (
                      <div className="mt-1">
                        <Badge tone="warning">Stripe: ждём привязки</Badge>
                      </div>
                    ) : null}
                  </Td>
                  <Td>{paidNow.has(e.id) ? <Badge tone="success">выплачено</Badge> : <span className="text-xs text-faint">нет</span>}</Td>
                  <Td className="text-xs text-muted">{e.lastPaidPeriod ?? '—'}</Td>
                  {canWrite ? (
                    <Td className="whitespace-nowrap text-right">
                      {stripeOn && e.active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={stripeLink.isPending && stripeLink.variables?.id === e.id}
                          onClick={() => stripeLink.mutate(e)}
                        >
                          <LinkSimple size={14} /> Ссылка Stripe
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setExtras(e)}>
                        Бонус
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                        Изменить
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void setActive(e, !e.active)}>
                        {e.active ? 'Снять' : 'Вернуть'}
                      </Button>
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}

      <SectionTitle
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <Switch checked={allPeriods} onChange={setAllPeriods} label="Все периоды" /> Все периоды
            </label>
            <Button size="sm" variant="outline" disabled={!payouts.data?.length} onClick={exportCsv}>
              <DownloadSimple size={14} /> CSV
            </Button>
          </div>
        }
      >
        История выплат
      </SectionTitle>
      <ErrorNote text={payouts.error ? errorText(payouts.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Когда</Th>
            <Th>Сотрудник</Th>
            <Th>Период</Th>
            <Th className="text-right">Начислено</Th>
            <Th className="text-right">На руки</Th>
            <Th>Способ</Th>
            <Th>Статус</Th>
            <Th>Примечание</Th>
            {canWrite ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {payouts.isPending ? (
            <TableEmpty colSpan={canWrite ? 9 : 8} loading />
          ) : (payouts.data ?? []).length === 0 ? (
            <TableEmpty colSpan={canWrite ? 9 : 8}>Выплат пока нет.</TableEmpty>
          ) : (
            (payouts.data ?? []).map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(p.createdAt)}</Td>
                <Td>{p.employeeName}</Td>
                <Td className="text-xs">{p.period}</Td>
                <Td className="text-right tabular-nums">
                  {money(p.amountCents, p.currency)}
                  {p.commissionCents !== 0 ? (
                    <div className="text-xs text-faint">
                      оклад {money(p.baseCents, p.currency)} + начисления {money(p.commissionCents, p.currency)}
                    </div>
                  ) : null}
                </Td>
                <Td className="text-right tabular-nums">
                  {money(p.netCents || p.amountCents, p.currency)}
                  {p.feeCents > 0 ? <div className="text-xs text-faint">комиссия Stripe −{money(p.feeCents, p.currency)}</div> : null}
                </Td>
                <Td className="text-xs">{PAYOUT_METHOD[p.method] ?? p.method}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{PAYOUT_STATUS[p.status] ?? p.status}</Badge>
                </Td>
                <Td className="max-w-[260px] text-xs text-muted">{p.failure ?? p.cancelReason ?? p.note ?? '—'}</Td>
                {canWrite ? (
                  <Td className="text-right">
                    {p.status === 'paid' || p.status === 'failed' ? (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => void cancel(p)}>
                        Отменить
                      </Button>
                    ) : null}
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {editing ? (
        <EmployeeDialog
          employee={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
      {paying ? (
        <PayDialog
          people={active.filter((e) => selected.has(e.id))}
          period={period}
          stripeOn={stripeOn}
          fees={s?.stripeFees ?? null}
          paidNow={paidNow}
          stripePaidNow={stripePaidNow}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            setSelected(new Set());
            refresh();
          }}
        />
      ) : null}
      {extras ? (
        <ExtrasDialog employee={extras} period={period} canWrite={canWrite} onClose={() => setExtras(null)} onChanged={refresh} />
      ) : null}
      <Dialog
        open={!!link}
        onClose={() => setLink(null)}
        title={`Ссылка Stripe: ${link?.name ?? ''}`}
        description={
          link?.ready
            ? 'Счёт уже привязан, выплаты через Stripe работают. По ссылке сотрудник может поменять карту или счёт.'
            : 'Отправьте ссылку сотруднику: на странице Stripe он укажет свои данные и банковский счёт или дебетовую карту. LawBid этих данных не видит. Если ссылка истекла, нажмите «Ссылка Stripe» ещё раз.'
        }
      >
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{link?.url}</span>
          {link ? <CopyButton text={link.url} /> : null}
        </div>
      </Dialog>
    </>
  );
}

function EmployeeDialog({ employee, onClose, onSaved }: { employee: Employee | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(employee?.name ?? '');
  const [roleTitle, setRoleTitle] = useState(employee?.roleTitle ?? '');
  const [amount, setAmount] = useState(employee ? centsToInput(employee.amountCents) : '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [methodNote, setMethodNote] = useState(employee?.methodNote ?? '');
  const cents = parseDollars(amount, { allowZero: true });
  const valid = name.trim().length >= 2 && cents !== null;
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        roleTitle: roleTitle.trim(),
        amountCents: cents!,
        currency: employee?.currency ?? 'usd',
        methodNote: methodNote.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      };
      if (employee)
        await api.PATCH('/admin/payroll/employees/{id}', {
          params: { path: { id: employee.id } },
          body,
        });
      else await api.POST('/admin/payroll/employees', { body });
    },
    onSuccess: () => {
      toast.success(employee ? 'Сохранено' : 'Сотрудник добавлен');
      onSaved();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog open onClose={onClose} title={employee ? `Изменить: ${employee.name}` : 'Новый сотрудник'}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Field label="Имя">
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Должность (необязательно)">
          <Input value={roleTitle} maxLength={120} placeholder="Модератор, поддержка…" onChange={(e) => setRoleTitle(e.target.value)} />
        </Field>
        <Field
          label="Оклад в месяц, $"
          hint={amount && cents === null ? 'Введите сумму, например 2500 или 2500.50' : '0, если платим только комиссии и бонусы.'}
        >
          <Input inputMode="decimal" value={amount} placeholder="2500" onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="E-mail (необязательно)" hint="Для ссылки Stripe, по которой сотрудник привязывает карту или счёт.">
          <Input type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Как платим (необязательно)" hint="Например «Zelle» или «Chase, счёт …1234».">
          <Input value={methodNote} maxLength={300} onChange={(e) => setMethodNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!valid} loading={save.isPending}>
            Сохранить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PayDialog({
  people,
  period,
  stripeOn,
  fees,
  paidNow,
  stripePaidNow,
  onClose,
  onDone,
}: {
  people: Employee[];
  period: string;
  stripeOn: boolean;
  fees: StripeFees | null;
  paidNow: Set<string>;
  stripePaidNow: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<Method>('manual');
  const [note, setNote] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.map((p) => [p.id, centsToInput(paidNow.has(p.id) ? 0 : p.amountCents)])),
  );
  const parsed = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, parseDollars(amounts[p.id] ?? '', { allowZero: true })])),
    [people, amounts],
  );
  const bad = people.filter((p) => parsed[p.id] === null);
  const notLinked = method === 'stripe' ? people.filter((p) => !p.stripePayoutsEnabled) : [];
  /** Salary (0 when already paid this period) + pending commissions. */
  const gross = (p: Employee) => (paidNow.has(p.id) ? 0 : (parsed[p.id] ?? 0)) + p.pendingCents;
  const fee = (p: Employee) => (method === 'stripe' && fees && gross(p) > 0 ? stripeFee(gross(p), fees, !stripePaidNow.has(p.id)) : 0);
  const totals = totalsByCurrency(people.map((p) => ({ currency: p.currency, cents: gross(p) })));
  const feeTotals = totalsByCurrency(people.map((p) => ({ currency: p.currency, cents: fee(p) })));
  const netTotals = totalsByCurrency(people.map((p) => ({ currency: p.currency, cents: gross(p) - fee(p) })));
  const anyFee = Object.values(feeTotals).some((v) => v > 0);

  const pay = useMutation({
    mutationFn: async () => {
      const overrides: Record<string, number> = {};
      for (const p of people) if (!paidNow.has(p.id) && parsed[p.id] !== p.amountCents) overrides[p.id] = parsed[p.id]!;
      return (
        await api.POST('/admin/payroll/payouts/bulk', {
          body: {
            employeeIds: people.map((p) => p.id),
            period,
            method,
            ...(Object.keys(overrides).length ? { amounts: overrides } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        })
      ).data!.data;
    },
    onSuccess: (r) => {
      const extra = [
        r.alreadyPaid.length ? `уже были выплачены: ${r.alreadyPaid.length}` : '',
        r.nothingOwed.length ? `нечего платить: ${r.nothingOwed.length}` : '',
        Object.values(r.fees).some((v) => v > 0) ? `комиссия Stripe ${totalsText(r.fees)} вычтена из выплат` : '',
        r.failed.length ? `не прошло через Stripe: ${r.failed.length}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const text = `Выплачено ${r.count} на ${totalsText(r.totals)}${extra ? `; ${extra}` : ''}`;
      if (r.failed.length) toast.error(text);
      else toast.success(text);
      onDone();
    },
    onError: (e) => {
      toast.error(e);
      // Owner 2026-10-22: from the limit on it waits for a second admin.
      if (e instanceof ApiError && e.code === 'ADMIN_APPROVAL_PENDING') {
        void qc.invalidateQueries({ queryKey: ['approvals-count'] });
        onDone();
      }
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={`Выплатить за ${period}`}
      description="Оклад для этого раза можно изменить (неполный месяц) или поставить 0. Комиссии и бонусы добавятся сами. Оклад в карточке не меняется."
    >
      <div className="space-y-4">
        <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
          {people.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{p.name}</div>
                <div className="text-xs text-faint">
                  {paidNow.has(p.id) ? 'оклад за период уже выплачен' : `оклад ${money(p.amountCents, p.currency)}`}
                  {p.pendingCents !== 0 ? ` · начислено ${money(p.pendingCents, p.currency)}` : ''}
                  {fee(p) > 0 ? ` · комиссия Stripe −${money(fee(p), p.currency)} · на руки ${money(gross(p) - fee(p), p.currency)}` : ''}
                </div>
              </div>
              <Input
                className={`w-32 text-right tabular-nums ${parsed[p.id] === null ? 'border-danger' : ''}`}
                inputMode="decimal"
                aria-label={`Оклад для ${p.name}`}
                disabled={paidNow.has(p.id)}
                value={amounts[p.id] ?? ''}
                onChange={(e) => setAmounts({ ...amounts, [p.id]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Способ">
            <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {Object.entries(PAYOUT_METHOD)
                .filter(([k]) => k !== 'stripe' || stripeOn)
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Примечание (необязательно)">
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {method === 'stripe' ? (
          <p className="rounded-xl bg-accent-soft p-3 text-xs text-gold-600">
            Деньги уйдут с баланса LawBid в Stripe на привязанные карты или счета сотрудников. Комиссию Stripe платит сотрудник: она
            вычитается из его выплаты, с вашего счёта уходит ровно начисленная сумма.
            {notLinked.length ? ` Ещё не привязали счёт: ${notLinked.map((p) => p.name).join(', ')}.` : ''}
          </p>
        ) : (
          <p className="text-xs text-muted">LawBid только записывает выплату; деньги вы переводите сами банком, Zelle или наличными.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="text-sm">
            <span className="text-muted">{people.length} чел. · итого </span>
            <span className="font-semibold tabular-nums text-heading">{totalsText(totals)}</span>
            {anyFee ? (
              <span className="text-muted">
                {' '}
                · комиссия Stripe −{totalsText(feeTotals)} · на руки {totalsText(netTotals)}
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button
              variant="gold"
              disabled={bad.length > 0 || notLinked.length > 0 || people.length === 0 || people.every((p) => gross(p) <= 0)}
              loading={pay.isPending}
              onClick={() => pay.mutate()}
            >
              Выплатить {totalsText(totals)}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Commissions (from the partner program), bonuses and corrections of one
 * person; a bonus added here is paid with their next «Выплатить». */
function ExtrasDialog({
  employee,
  period,
  canWrite,
  onClose,
  onChanged,
}: {
  employee: Employee;
  period: string;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { ask, dialog: reasonDialog } = useReason();
  const [kind, setKind] = useState<'bonus' | 'adjustment'>('bonus');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const cents = parseDollars(amount, { allowNegative: true });
  const list = useQuery({
    queryKey: ['payroll-accruals', employee.id],
    queryFn: async () =>
      (
        await api.GET('/admin/payroll/accruals', {
          params: { query: { employeeId: employee.id } },
        })
      ).data!.data,
  });
  const changed = () => {
    void qc.invalidateQueries({ queryKey: ['payroll-accruals', employee.id] });
    onChanged();
  };
  const add = useMutation({
    mutationFn: async () =>
      api.POST('/admin/payroll/employees/{id}/accruals', {
        params: { path: { id: employee.id } },
        body: { kind, amountCents: cents!, period, note: note.trim() },
      }),
    onSuccess: () => {
      toast.success('Добавлено: войдёт в следующую выплату');
      setAmount('');
      setNote('');
      changed();
    },
    onError: (e) => toast.error(e),
  });
  const cancel = async (a: Accrual) => {
    const r = await ask({
      title: `Отменить ${ACCRUAL_KIND[a.kind]?.toLowerCase() ?? a.kind} ${money(a.amountCents, a.currency)}?`,
      description: 'Сумма не войдёт в выплату. Причина попадёт в журнал аудита.',
      label: 'Причина',
      min: 10,
      max: 500,
      confirm: 'Отменить',
      danger: true,
    });
    if (!r) return;
    api
      .POST('/admin/payroll/accruals/{id}/cancel', {
        params: { path: { id: a.id } },
        body: { reason: r.text },
      })
      .then(() => {
        toast.success('Отменено');
        changed();
      })
      .catch((e: unknown) => toast.error(e));
  };
  const rows = list.data ?? [];
  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={`Начисления: ${employee.name}`}
      description="Комиссии за привлечённых адвокатов и клиентов приходят из партнёрской программы сами. Бонус или корректировку можно добавить вручную."
    >
      {reasonDialog}
      <div className="space-y-4">
        <ErrorNote text={list.error ? errorText(list.error) : null} />
        <div className="max-h-[40vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Что</Th>
                <Th>Период</Th>
                <Th className="text-right">Сумма</Th>
                <Th>Статус</Th>
                {canWrite ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {list.isPending ? (
                <TableEmpty colSpan={canWrite ? 5 : 4} loading />
              ) : rows.length === 0 ? (
                <TableEmpty colSpan={canWrite ? 5 : 4}>Начислений пока нет.</TableEmpty>
              ) : (
                rows.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <div className="text-sm text-ink">{ACCRUAL_KIND[a.kind] ?? a.kind}</div>
                      <div className="max-w-[260px] truncate text-xs text-faint">
                        {a.note ?? (a.source === 'partner' ? 'партнёрская программа' : a.source)}
                      </div>
                    </Td>
                    <Td className="text-xs">{a.period}</Td>
                    <Td className="text-right tabular-nums">{money(a.amountCents, a.currency)}</Td>
                    <Td>
                      <Badge tone={a.status === 'paid' ? 'success' : a.status === 'pending' ? 'warning' : 'neutral'}>
                        {ACCRUAL_STATUS[a.status] ?? a.status}
                      </Badge>
                    </Td>
                    {canWrite ? (
                      <Td className="text-right">
                        {a.status === 'pending' ? (
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => void cancel(a)}>
                            Отменить
                          </Button>
                        ) : null}
                      </Td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
        {canWrite ? (
          <form
            className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[160px_140px_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (cents !== null && note.trim().length >= 3) add.mutate();
            }}
          >
            <Field label="Тип">
              <Select value={kind} onChange={(e) => setKind(e.target.value as 'bonus' | 'adjustment')}>
                <option value="bonus">Бонус</option>
                <option value="adjustment">Корректировка</option>
              </Select>
            </Field>
            <Field label="Сумма, $" hint={amount && cents === null ? 'Например 150 или -50' : undefined}>
              <Input inputMode="decimal" value={amount} placeholder="150" onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="За что">
              <Input value={note} maxLength={300} placeholder="Лучший месяц" onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="submit" disabled={cents === null || note.trim().length < 3} loading={add.isPending}>
              <Plus size={14} /> Добавить
            </Button>
          </form>
        ) : null}
      </div>
    </Dialog>
  );
}
