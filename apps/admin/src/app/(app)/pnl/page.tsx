'use client';

import { useState } from 'react';
import { ArrowClockwise } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { barHeights, money } from '@/lib/launch';
import { KIND_LABEL, marginText, type PnlPeriod, type PnlReport } from '@/lib/pnl';

const KEY = ['pnl'];

/**
 * Owner 2026-10-25: «Прибыль» — what is left after refunds, Stripe fees and
 * the bills of the outside services. The page reads ONLY the snapshot the
 * server counts once a day (the button recounts, at most once per 10 min).
 */
export default function PnlPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.GET('/admin/pnl')).data!.data as PnlReport,
  });
  const refresh = useMutation({
    mutationFn: async () => (await api.POST('/admin/pnl/refresh')).data!.data as PnlReport,
    onSuccess: (r) => {
      qc.setQueryData(KEY, r);
      toast.success('Пересчитано (не чаще раза в 10 минут)');
    },
    onError: (e) => toast.error(e),
  });
  const [view, setView] = useState<'days' | 'weeks'>('days');
  const r = q.data;
  const rows: { from: string; revenueUsd: number; costUsd: number; profitUsd: number; marginPercent?: number | null }[] =
    view === 'days'
      ? (r?.days ?? []).map((d) => ({ from: d.day, revenueUsd: d.revenueUsd, costUsd: d.costUsd, profitUsd: d.profitUsd }))
      : (r?.weeks ?? []).map((w) => ({ from: w.weekStart, revenueUsd: w.revenueUsd, costUsd: w.costUsd, profitUsd: w.profitUsd, marginPercent: w.marginPercent }));
  const when = r?.computedAt ? new Date(r.computedAt).toLocaleString('ru-RU') : null;

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Прибыль"
        subtitle="Что остаётся после возвратов, комиссии Stripe и счетов сервисов. Платежи клиентов адвокатам сюда не входят. Считается раз в сутки, страница читает готовый расчёт."
        actions={
          <Button variant="outline" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            <ArrowClockwise size={16} /> Пересчитать
          </Button>
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {!r ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : !r.month || !r.today || !r.week ? (
        <Card className="p-5 text-sm text-muted" data-testid="pnl-empty">
          Расчёта ещё нет: он появится после ночного пересчёта. Можно нажать «Пересчитать».
        </Card>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted">Посчитано: {when}. Дни по UTC.</p>
          <div className="mb-6 grid gap-3 lg:grid-cols-3">
            <PeriodCard title="Сегодня" p={r.today} hint="за сегодняшний день, он ещё не закончился" />
            <PeriodCard title="Эта неделя" p={r.week} hint="с понедельника по сегодня" />
            <PeriodCard title="Этот месяц" p={r.month} hint="с 1-го числа по сегодня" />
          </div>
          {r.vendorDataFrom ? (
            <p className="mb-6 text-xs text-muted">
              Счета сервисов известны с {r.vendorDataFrom}; за более ранние дни учтены только постоянные платежи.
            </p>
          ) : (
            <p className="mb-6 text-xs text-muted">Счетов сервисов пока нет: считаются только постоянные платежи.</p>
          )}

          <SectionTitle>Динамика</SectionTitle>
          <div className="mb-2 flex gap-2" role="tablist">
            <Button variant={view === 'days' ? 'default' : 'outline'} onClick={() => setView('days')}>
              30 дней
            </Button>
            <Button variant={view === 'weeks' ? 'default' : 'outline'} onClick={() => setView('weeks')}>
              12 недель
            </Button>
          </div>
          <Card className="mb-6 p-4" data-testid="pnl-trend">
            <div className="flex h-24 items-end gap-1" aria-hidden>
              {barHeights(rows.map((w) => ({ usd: Math.max(w.profitUsd, 0) }))).map((h, i) => (
                <div key={rows[i].from} className="flex-1 rounded-sm bg-accent/70" style={{ height: `${h}%` }} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Прибыль по {view === 'days' ? 'дням' : 'неделям'}, слева старые. Убыточные периоды показаны пустыми, цифры ниже.
            </p>
            <div className="mt-3 grid gap-1 text-sm">
              {rows
                .slice()
                .reverse()
                .map((w) => (
                  <div key={w.from} className="flex flex-wrap justify-between gap-2">
                    <span className="text-muted">{view === 'days' ? w.from : `с ${w.from}`}</span>
                    <span>
                      доход {money(w.revenueUsd)}, расходы {money(w.costUsd)},{' '}
                      <b className={w.profitUsd < 0 ? 'text-danger' : 'text-heading'}>прибыль {money(w.profitUsd)}</b>
                      {w.marginPercent !== undefined ? ` (${marginText(w.marginPercent)})` : ''}
                    </span>
                  </div>
                ))}
            </div>
          </Card>

          <SectionTitle>Откуда доход в этом месяце</SectionTitle>
          <Card className="mb-6 p-4" data-testid="pnl-kinds">
            {r.byKind.length === 0 ? (
              <p className="text-sm text-muted">Платежей в этом месяце пока нет.</p>
            ) : (
              r.byKind.map((k) => (
                <div key={k.kind} className="flex justify-between py-1 text-sm">
                  <span>{KIND_LABEL[k.kind] ?? k.kind}</span>
                  <b className="text-heading">{money(k.revenueUsd)}</b>
                </div>
              ))
            )}
            <p className="mt-2 text-xs text-muted">Места помощников оплачиваются в счёте подписки адвоката, но здесь показаны отдельной строкой.</p>
          </Card>
        </>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold text-heading">{value}</div>
      <div className="text-xs text-muted">{hint}</div>
    </div>
  );
}

function PeriodCard({ title, p, hint }: { title: string; p: PnlPeriod; hint: string }) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4" data-testid={`pnl-${title}`}>
      <div className="text-sm font-medium text-heading">{title}</div>
      <div className="text-xs text-muted">{hint}</div>
      <div>
        <div className={`text-3xl font-semibold ${p.profitUsd < 0 ? 'text-danger' : 'text-heading'}`}>{money(p.profitUsd)}</div>
        <div className="text-xs text-muted">Прибыль: доход минус все расходы. Маржа {marginText(p.marginPercent)}.</div>
      </div>
      <Stat label="Доход" value={money(p.revenueUsd)} hint="деньги за подписки, места, продвижение, звёзды после налога, возвратов и комиссии Stripe" />
      <Stat label="Счета сервисов" value={money(p.vendorCostUsd)} hint="AWS, SMS, видео, Cloudflare за эти дни" />
      <Stat label="Постоянные платежи" value={money(p.fixedCostUsd)} hint="то, что вписано на странице «Расходы», по дням" />
    </Card>
  );
}
