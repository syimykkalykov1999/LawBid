'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins } from '@phosphor-icons/react';
import { Fragment, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { money } from '@/lib/payroll';
import { isOwner, staffDelete, staffPost, staffPut, usePieceOverview, useRates, type PieceOverview, type Rate } from '@/lib/staff-data';
import { dayLabel, PIECE_STATUS, periodNow, RATE_KIND, WORKSPACE_NAME } from '@/lib/staff-labels';

const KINDS = Object.keys(RATE_KIND);

/** Dollars typed by the owner («0,35») → whole cents; null when not a price. */
export function centsFromInput(raw: string): number | null {
  const v = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  const c = Math.round(v * 100);
  return c >= 1 && c <= 100_000 ? c : null;
}

function NewRate() {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState(KINDS[0]);
  const [workspace, setWorkspace] = useState('mass');
  const [price, setPrice] = useState('');
  const [boost, setBoost] = useState('');
  const cents = centsFromInput(price);
  const boostNum = boost.trim() === '' ? undefined : Number(boost.replace(',', '.'));
  const boostOk = boostNum === undefined || (Number.isFinite(boostNum) && boostNum >= 1 && boostNum <= 2);
  const save = useMutation({
    mutationFn: () => staffPut('/admin/staff/rates', { kind, workspace, amountCents: cents, boostMult: boostNum }),
    onSuccess: () => {
      toast.success('Ставка сохранена. Предыдущая закрыта.');
      setPrice('');
      setBoost('');
      void qc.invalidateQueries({ queryKey: ['staff-rates'] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="За что">
          <Select aria-label="За что платим" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {RATE_KIND[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Пространство">
          <Select aria-label="Пространство" value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
            {['mass', 'finance', 'owner'].map((w) => (
              <option key={w} value={w}>
                {WORKSPACE_NAME[w]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Цена за одно решение, $" hint="например 0,35">
          <Input aria-label="Цена, доллары" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Недельный множитель" hint="от 1 до 2, по желанию">
          <Input aria-label="Множитель" inputMode="decimal" value={boost} onChange={(e) => setBoost(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={cents === null || !boostOk} loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить ставку
        </Button>
        <span className="text-xs text-faint">Нужен код из приложения. Действует с этого момента, прошлые дни не пересчитываются.</span>
      </div>
    </Card>
  );
}

function RatesTable({ rates }: { rates: Rate[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const end = useMutation({
    mutationFn: (id: string) => staffDelete(`/admin/staff/rates/${id}`),
    onSuccess: () => {
      toast.success('Ставка закончена.');
      void qc.invalidateQueries({ queryKey: ['staff-rates'] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Table>
      <thead>
        <tr>
          <Th>За что</Th>
          <Th>Пространство</Th>
          <Th>Цена</Th>
          <Th>Множитель</Th>
          <Th>Действует</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {rates.length === 0 ? (
          <TableEmpty colSpan={6}>Ставок нет: без ставки за решения ничего не начисляется.</TableEmpty>
        ) : (
          rates.map((r) => (
            <tr key={r.id}>
              <Td>{RATE_KIND[r.kind] ?? r.kind}</Td>
              <Td>{WORKSPACE_NAME[r.workspace] ?? r.workspace}</Td>
              <Td className="tabular-nums">{money(r.amountCents, r.currency)}</Td>
              <Td className="tabular-nums">{r.boostMult ? `×${r.boostMult}` : '—'}</Td>
              <Td className="text-sm text-muted">
                {r.active ? <Badge tone="success">сейчас</Badge> : <Badge>закончилась</Badge>} с {dayLabel(r.validFrom)}
                {r.validTo ? ` по ${dayLabel(r.validTo)}` : ''}
              </Td>
              <Td>
                {r.active ? (
                  <Button size="sm" variant="ghost" loading={end.isPending && end.variables === r.id} onClick={() => end.mutate(r.id)}>
                    Закончить
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}

function DayButtons({ adminId, day, status }: { adminId: string; day: string; status: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const done = () => void qc.invalidateQueries({ queryKey: ['staff-piecework'] });
  const dispute = useMutation({
    mutationFn: () => staffPost(`/admin/staff/piecework/${adminId}/${day}/dispute`, { reason: 'Спорный день: проверка владельцем' }),
    onSuccess: () => {
      toast.success('День удержан: начисление отменено.');
      done();
    },
    onError: (e) => toast.error(e),
  });
  const rerun = useMutation({
    mutationFn: () => staffPost(`/admin/staff/piecework/${adminId}/${day}/rerun`),
    onSuccess: () => {
      toast.success('День пересчитан.');
      done();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <span className="flex gap-1">
      {status !== 'disputed' ? (
        <Button size="sm" variant="ghost" loading={dispute.isPending} onClick={() => dispute.mutate()}>
          Удержать
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" loading={rerun.isPending} onClick={() => rerun.mutate()}>
        Пересчитать
      </Button>
    </span>
  );
}

function Month({ d }: { d: PieceOverview }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <p className="mb-3 text-sm text-ink">
        За месяц: <b className="tabular-nums">{money(d.totals.amountCents, d.currency)}</b> · людей {d.totals.people} · решений {d.totals.units}
        {d.totals.heldUnits > 0 ? ` · не оплачено (отменены): ${d.totals.heldUnits}` : ''}
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Сотрудник</Th>
            <Th>Пространство</Th>
            <Th>Решений</Th>
            <Th>Сумма</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {d.people.length === 0 ? (
            <TableEmpty colSpan={5}>За этот месяц начислений нет.</TableEmpty>
          ) : (
            d.people.map((p) => (
              <Fragment key={p.adminId}>
                <tr>
                  <Td className="font-medium text-heading">{p.name}</Td>
                  <Td>{WORKSPACE_NAME[p.workspace] ?? p.workspace}</Td>
                  <Td className="tabular-nums">{p.units}</Td>
                  <Td className="tabular-nums">{p.amountCents == null ? '—' : money(p.amountCents, d.currency)}</Td>
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === p.adminId ? null : p.adminId)}>
                      {openId === p.adminId ? 'Свернуть дни' : 'Дни'}
                    </Button>
                  </Td>
                </tr>
                {openId === p.adminId
                  ? p.days.map((day) => {
                      const s = PIECE_STATUS[day.status] ?? PIECE_STATUS.accrued;
                      return (
                        <tr key={`${p.adminId}-${day.day}`} className="bg-surface-2/50" data-testid="piece-day">
                          <Td className="pl-8 text-sm text-muted">{dayLabel(day.day)}</Td>
                          <Td>
                            <Badge tone={s.tone}>{s.label}</Badge>
                          </Td>
                          <Td className="tabular-nums text-sm">
                            {day.units}
                            {day.heldUnits > 0 ? ` (−${day.heldUnits})` : ''} · ×{day.qualityMult.toFixed(2)}
                          </Td>
                          <Td className="tabular-nums text-sm">{money(day.amountCents, d.currency)}</Td>
                          <Td>
                            <DayButtons adminId={p.adminId} day={day.day} status={day.status} />
                          </Td>
                        </tr>
                      );
                    })
                  : null}
              </Fragment>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}

/** «Ставки»: what a decision is paid, and what was paid this month. */
export function RatesPage() {
  const { data: me } = useMe();
  const owner = isOwner(me);
  const [period, setPeriod] = useState(periodNow());
  const rates = useRates(owner);
  const month = usePieceOverview(period, owner);
  const missing = rates.data && !rates.data.ok;

  return (
    <>
      <PageHeader
        eyebrow="Команда и контроль"
        title="Ставки за решения"
        subtitle="Сколько платим за одно решение. Сумма за день = решения × ставка × коэффициент качества (1,10 / 1,00 / 0,90 / 0,75) и попадает в «Зарплаты» как начисление."
      />
      <ErrorNote text={rates.error ? errorText(rates.error) : month.error ? errorText(month.error) : null} />
      {rates.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : missing ? (
        <EmptyState icon={Coins} title="Оплата за решения выключена" text="Включите переключатель «Сдельная оплата в «Зарплаты»» в «Настройки». До этого ставки не нужны." />
      ) : (
        <div className="space-y-4">
          <NewRate />
          <RatesTable rates={rates.data?.ok ? rates.data.data : []} />
          <SectionTitle
            action={
              <Input aria-label="Месяц" type="month" value={period} max={periodNow()} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-44" />
            }
          >
            Что начислено
          </SectionTitle>
          {month.isPending ? <Skeleton className="h-32 w-full" /> : month.data?.ok ? <Month d={month.data.data} /> : null}
        </div>
      )}
    </>
  );
}
