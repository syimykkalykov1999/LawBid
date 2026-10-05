'use client';

import { CheckCircle, DownloadSimple, LinkSimple, Money, Plus, UsersThree, Wallet, WarningCircle } from '@phosphor-icons/react';
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
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import {
  centsToInput,
  currentPeriod,
  downloadCsv,
  money,
  parseDollars,
  PAYOUT_METHOD,
  PAYOUT_STATUS,
  toCsv,
  totalsByCurrency,
  totalsText,
} from '@/lib/payroll';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type Employee = components['schemas']['PayrollEmployeeDto'];
type Payout = components['schemas']['PayrollPayoutDto'];
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
  const [link, setLink] = useState<{ name: string; url: string; ready: boolean } | null>(null);

  const employees = useQuery({
    queryKey: ['payroll-employees', showInactive],
    queryFn: async () =>
      (await api.GET('/admin/payroll/employees', { params: { query: { includeInactive: showInactive } } })).data!.data,
  });
  const summary = useQuery({
    queryKey: ['payroll-summary', period],
    queryFn: async () => (await api.GET('/admin/payroll/summary', { params: { query: { period } } })).data!.data,
  });
  const periodPayouts = useQuery({
    queryKey: ['payroll-payouts', period],
    queryFn: async () => (await api.GET('/admin/payroll/payouts', { params: { query: { period } } })).data!.data,
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
  };

  const rows = employees.data ?? [];
  const active = rows.filter((e) => e.active);
  const paidNow = new Set(
    (periodPayouts.data ?? []).filter((p) => p.status === 'paid' || p.status === 'processing').map((p) => p.employeeId),
  );
  const stripeOn = summary.data?.stripeAvailable ?? false;
  const unpaidActive = active.filter((e) => !paidNow.has(e.id)).map((e) => e.id);

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
      r: (await api.POST('/admin/payroll/employees/{id}/stripe-link', { params: { path: { id: e.id } } })).data!.data,
    }),
    onSuccess: ({ e, r }) => {
      setLink({ name: e.name, url: r.url, ready: r.payoutsEnabled });
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const setActive = (e: Employee, value: boolean) =>
    api
      .PATCH('/admin/payroll/employees/{id}', { params: { path: { id: e.id } }, body: { active: value } })
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
      .POST('/admin/payroll/payouts/{id}/cancel', { params: { path: { id: p.id } }, body: { reason: r.text } })
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
        ['date', 'employee', 'period', 'amount', 'currency', 'method', 'status', 'note', 'transfer_id', 'cancel_reason'],
        list.map((p) => [
          p.createdAt,
          p.employeeName,
          p.period,
          (p.amountCents / 100).toFixed(2),
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
  const cols = canWrite ? 7 : 5;
  return (
    <>
      {reasonDialog}
      <PageHeader
        eyebrow="Деньги"
        title="Зарплаты"
        subtitle="Сотрудники с фиксированной суммой в месяц. Отметьте людей и нажмите «Выплатить»: один человек получает выплату один раз за период. Каждое действие видно в журнале аудита."
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi i={0} icon={UsersThree} title="Сотрудников" value={s?.activeEmployees ?? 0} />
        <Kpi i={1} icon={Wallet} title="В месяц по ставкам" value={s?.monthly.usd ?? 0} format={(n) => money(n)} gold />
        <Kpi i={2} icon={CheckCircle} title={`Выплачено за ${period}`} value={s?.paid.usd ?? 0} format={(n) => money(n)} />
        <Kpi i={3} icon={WarningCircle} title="Ещё не выплачено" value={s?.unpaidEmployees ?? 0} warn />
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
                  Выбрать всех невыплаченных
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
        <EmptyState icon={Wallet} title="Пока никого" text="Добавьте сотрудника и его сумму в месяц." />
      ) : (
        <Table>
          <thead>
            <tr>
              {canWrite ? <Th className="w-8" /> : null}
              <Th>Сотрудник</Th>
              <Th className="text-right">В месяц</Th>
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
                        disabled={!e.active || paidNow.has(e.id)}
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
                  <Td className="text-right tabular-nums">{money(e.amountCents, e.currency)}</Td>
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
            <Th className="text-right">Сумма</Th>
            <Th>Способ</Th>
            <Th>Статус</Th>
            <Th>Примечание</Th>
            {canWrite ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {payouts.isPending ? (
            <TableEmpty colSpan={canWrite ? 8 : 7} loading />
          ) : (payouts.data ?? []).length === 0 ? (
            <TableEmpty colSpan={canWrite ? 8 : 7}>Выплат пока нет.</TableEmpty>
          ) : (
            (payouts.data ?? []).map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(p.createdAt)}</Td>
                <Td>{p.employeeName}</Td>
                <Td className="text-xs">{p.period}</Td>
                <Td className="text-right tabular-nums">{money(p.amountCents, p.currency)}</Td>
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
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            setSelected(new Set());
            refresh();
          }}
        />
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
  const cents = parseDollars(amount);
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
      if (employee) await api.PATCH('/admin/payroll/employees/{id}', { params: { path: { id: employee.id } }, body });
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
        <Field label="Сумма в месяц, $" hint={amount && cents === null ? 'Введите сумму, например 2500 или 2500.50' : undefined}>
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
  onClose,
  onDone,
}: {
  people: Employee[];
  period: string;
  stripeOn: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<Method>('manual');
  const [note, setNote] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.map((p) => [p.id, centsToInput(p.amountCents)])),
  );
  const parsed = useMemo(() => Object.fromEntries(people.map((p) => [p.id, parseDollars(amounts[p.id] ?? '')])), [people, amounts]);
  const bad = people.filter((p) => parsed[p.id] === null);
  const notLinked = method === 'stripe' ? people.filter((p) => !p.stripePayoutsEnabled) : [];
  const totals = totalsByCurrency(people.map((p) => ({ currency: p.currency, cents: parsed[p.id] ?? 0 })));

  const pay = useMutation({
    mutationFn: async () => {
      const overrides: Record<string, number> = {};
      for (const p of people) if (parsed[p.id] !== p.amountCents) overrides[p.id] = parsed[p.id]!;
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
        r.failed.length ? `не прошло через Stripe: ${r.failed.length}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const text = `Выплачено ${r.count} на ${totalsText(r.totals)}${extra ? `; ${extra}` : ''}`;
      if (r.failed.length) toast.error(text);
      else toast.success(text);
      onDone();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={`Выплатить за ${period}`}
      description="Проверьте суммы: для этого раза их можно изменить (премия, неполный месяц). Ставка в карточке не меняется."
    >
      <div className="space-y-4">
        <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
          {people.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{p.name}</div>
                <div className="text-xs text-faint">ставка {money(p.amountCents, p.currency)}</div>
              </div>
              <Input
                className={`w-32 text-right tabular-nums ${parsed[p.id] === null ? 'border-danger' : ''}`}
                inputMode="decimal"
                aria-label={`Сумма для ${p.name}`}
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
            Деньги уйдут с баланса LawBid в Stripe на привязанные карты или счета сотрудников.
            {notLinked.length ? ` Ещё не привязали счёт: ${notLinked.map((p) => p.name).join(', ')}.` : ''}
          </p>
        ) : (
          <p className="text-xs text-muted">LawBid только записывает выплату; деньги вы переводите сами банком, Zelle или наличными.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="text-sm">
            <span className="text-muted">{people.length} чел. · итого </span>
            <span className="font-semibold tabular-nums text-heading">{totalsText(totals)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button
              variant="gold"
              disabled={bad.length > 0 || notLinked.length > 0 || people.length === 0}
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
