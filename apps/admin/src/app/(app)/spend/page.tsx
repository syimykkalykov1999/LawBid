'use client';

import { ArrowClockwise, Plus, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { UpdatedAgo } from '@/components/updated-ago';
import { api, errorText } from '@/lib/api/client';
import {
  barHeights,
  fixedFromDrafts,
  freeTierPercent,
  freeTierTone,
  keepLine,
  money,
  newFixedId,
  PERIOD_WORD,
  VENDOR_STATUS,
  type FixedDraft,
  type SpendReport,
  type VendorSpend,
} from '@/lib/launch';
import { livePoll } from '@/lib/live';
import { CostRegistry } from './registry';

const KEY = ['spend'];

/**
 * Owner 2026-10-24: «Расходы» — where the money goes. Per service: this
 * month, last month, a 30-day trend, the forecast and (where it exists) the
 * free allowance. Numbers come from a cached snapshot (AWS is read at most
 * every 6 hours: each Cost Explorer request costs money); a service that is
 * down shows its last numbers and says so.
 */
export default function SpendPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.GET('/admin/spend')).data!.data as SpendReport,
    refetchInterval: livePoll(),
  });
  const set = (r: SpendReport) => qc.setQueryData(KEY, r);
  const refresh = useMutation({
    mutationFn: async () => (await api.POST('/admin/spend/refresh')).data!.data as SpendReport,
    onSuccess: (r) => {
      set(r);
      toast.success('Данные обновлены (AWS не чаще раза в 6 часов, чтобы не платить за запросы)');
    },
    onError: (e) => toast.error(e),
  });
  const r = q.data;

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Расходы"
        subtitle="Сколько денег уходит каждому сервису: за этот месяц, за прошлый, по дням, прогноз до конца месяца и бесплатный остаток. Данные кэшируются: AWS читается раз в 6 часов."
        actions={
          <>
            {r ? <UpdatedAgo at={q.dataUpdatedAt} /> : null}
            <Button variant="outline" loading={refresh.isPending} onClick={() => refresh.mutate()}>
              <ArrowClockwise size={16} /> Обновить
            </Button>
          </>
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {!r ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <Card className="mb-6 p-5" data-testid="spend-total">
            <div className="text-xs text-muted">Сколько держать на счету в этом месяце</div>
            <div className="mt-1 text-3xl font-semibold text-heading">{money(r.total.keepOnAccountUsd)}</div>
            <p className="mt-2 text-sm text-muted">{keepLine(r.total)}</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <Stat label="Потрачено за месяц (счета)" value={money(r.total.monthToDateUsd)} />
              <Stat label="Постоянные платежи в месяц" value={money(r.total.fixedMonthUsd)} />
              <Stat label="Комиссия Stripe (отдельно)" value={money(r.total.stripeFeesUsd)} />
            </div>
            <p className="mt-3 text-xs text-muted">
              Комиссию Stripe не нужно держать на счету: он сам вычитает её из платежей клиентов.
            </p>
          </Card>

          <CostRegistry />

          <SectionTitle>По сервисам</SectionTitle>
          <div className="mb-6 grid gap-3 lg:grid-cols-2">
            {r.vendors.map((v) => (
              <VendorCard key={v.id} v={v} />
            ))}
          </div>

          <SectionTitle>Постоянные платежи (вписываются вручную)</SectionTitle>
          <FixedCosts report={r} onSaved={set} />

          <SectionTitle>Цены, по которым считается Cloudflare</SectionTitle>
          <Prices report={r} onSaved={set} />
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold text-heading">{value}</div>
    </div>
  );
}

function VendorCard({ v }: { v: VendorSpend }) {
  const st = VENDOR_STATUS[v.status] ?? VENDOR_STATUS.nodata;
  const bars = barHeights(v.daily);
  const ft = freeTierPercent(v.freeTier);
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4" data-testid={`vendor-${v.id}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-heading">{v.label}</div>
        <Badge tone={st.tone} dot className="shrink-0">
          {st.label}
        </Badge>
      </div>
      {v.error ? <p className="break-words text-xs text-danger">{v.error}</p> : null}
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Stat label="Этот месяц" value={money(v.monthToDateUsd)} />
        <Stat label="Прошлый месяц" value={money(v.lastMonthUsd)} />
        <Stat label="Прогноз на месяц" value={money(v.forecastUsd)} />
      </div>
      {v.coveredByCreditsUsd != null && v.coveredByCreditsUsd > 0 ? (
        <p className="text-sm text-ink">Покрыто кредитами: {money(v.coveredByCreditsUsd)}</p>
      ) : null}
      {v.balanceUsd != null ? <p className="text-sm text-ink">Остаток на счёте у сервиса: {money(v.balanceUsd)}</p> : null}
      {v.freeTier && ft !== null ? (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{v.freeTier.label}</span>
            <span>
              {v.freeTier.used} из {v.freeTier.free} {v.freeTier.unit}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuenow={Math.min(100, ft)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full ${freeTierTone(ft) === 'danger' ? 'bg-danger' : freeTierTone(ft) === 'warning' ? 'bg-warning' : 'bg-success'}`}
              style={{ width: `${Math.min(100, ft)}%` }}
            />
          </div>
        </div>
      ) : null}
      {bars.length > 0 ? (
        <div>
          <div className="mb-1 text-xs text-muted">По дням, последние 30</div>
          <div className="flex h-12 items-end gap-0.5" aria-label="График расходов по дням">
            {v.daily.map((d, i) => (
              <div
                key={d.date}
                title={`${d.date}: ${money(d.usd)}`}
                className="min-w-0 flex-1 rounded-sm bg-gold-500/70"
                style={{ height: `${bars[i]}%` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Графика по дням у этого сервиса нет.</p>
      )}
      {v.lines.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {v.lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-3">
              <span className="min-w-0 break-words text-ink">
                {l.label}
                {l.note ? <span className="text-muted"> · {l.note}</span> : null}
              </span>
              <span className="shrink-0 text-heading">{money(l.usd)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {v.notes.map((n) => (
        <p key={n} className="text-xs text-muted">
          {n}
        </p>
      ))}
      {v.updatedAt ? <p className="text-xs text-faint">Данные от {v.updatedAt.slice(0, 16).replace('T', ' ')} UTC</p> : null}
    </Card>
  );
}

function FixedCosts({ report, onSaved }: { report: SpendReport; onSaved: (r: SpendReport) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<FixedDraft[]>([]);
  useEffect(() => {
    setRows(
      report.fixed.map((f) => ({
        id: f.id,
        label: f.label,
        usd: String(f.usd),
        period: f.period,
        paidMonth: f.paidMonth ?? '',
      })),
    );
  }, [report.fixed]);
  const body = fixedFromDrafts(rows);
  const save = useMutation({
    mutationFn: async () => (await api.PUT('/admin/spend/fixed-costs', { body: body! })).data!.data as SpendReport,
    onSuccess: (r) => {
      onSaved(r);
      toast.success('Постоянные платежи сохранены');
    },
    onError: (e) => toast.error(e),
  });
  const patch = (id: string, p: Partial<FixedDraft>) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <Card className="mb-6 flex flex-col gap-3 p-4">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Пока пусто. Добавьте, например, Apple Developer ($99 раз в год), Google Play ($25 один раз), страховку, домены.</p>
      ) : null}
      {rows.map((r) => (
        <div key={r.id} className="grid gap-2 sm:grid-cols-[1fr_110px_150px_120px_auto] sm:items-end">
          <Field label="Название" htmlFor={`fx-l-${r.id}`}>
            <Input id={`fx-l-${r.id}`} value={r.label} onChange={(e) => patch(r.id, { label: e.target.value })} />
          </Field>
          <Field label="Сумма, $" htmlFor={`fx-u-${r.id}`}>
            <Input id={`fx-u-${r.id}`} inputMode="decimal" value={r.usd} onChange={(e) => patch(r.id, { usd: e.target.value })} />
          </Field>
          <Field label="Как часто" htmlFor={`fx-p-${r.id}`}>
            <select
              id={`fx-p-${r.id}`}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm"
              value={r.period}
              onChange={(e) => patch(r.id, { period: e.target.value as FixedDraft['period'] })}
            >
              {(Object.keys(PERIOD_WORD) as FixedDraft['period'][]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_WORD[p]}
                </option>
              ))}
            </select>
          </Field>
          {r.period === 'once' ? (
            <Field label="Месяц (ГГГГ-ММ)" htmlFor={`fx-m-${r.id}`}>
              <Input id={`fx-m-${r.id}`} value={r.paidMonth} placeholder="2026-10" onChange={(e) => patch(r.id, { paidMonth: e.target.value })} />
            </Field>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" aria-label="Удалить строку" onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))}>
            <Trash size={16} />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((cur) => [...cur, { id: newFixedId(cur), label: '', usd: '', period: 'month', paidMonth: '' }])}
        >
          <Plus size={14} /> Добавить
        </Button>
        <Button disabled={body === null} loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
        {body === null ? <span className="text-xs text-muted">Заполните название и сумму в каждой строке.</span> : null}
      </div>
    </Card>
  );
}

function Prices({ report, onSaved }: { report: SpendReport; onSaved: (r: SpendReport) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(Object.fromEntries(report.prices.map((p) => [p.key, String(p.value)])));
  }, [report.prices]);
  const save = useMutation({
    mutationFn: async () => {
      const values: Record<string, number> = {};
      for (const p of report.prices) {
        const n = Number((draft[p.key] ?? '').replace(',', '.'));
        if (Number.isFinite(n) && n >= 0 && n !== p.value) values[p.key] = n;
      }
      return (await api.PUT('/admin/spend/prices', { body: { values } })).data!.data as SpendReport;
    },
    onSuccess: (r) => {
      onSaved(r);
      toast.success('Цены сохранены, расчёт обновлён');
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="mb-6 flex flex-col gap-3 p-4">
      <p className="text-sm text-muted">
        Это цены Cloudflare с их сайта. Если цена изменилась, поправьте число: расчёт пересчитается сразу, без нового запроса к Cloudflare.
      </p>
      {report.prices.map((p) => (
        <div key={p.key} className="grid gap-2 sm:grid-cols-[1fr_140px] sm:items-end">
          <div className="min-w-0 text-sm">
            <div className="text-ink">{p.label}</div>
            <div className="text-xs text-muted">
              {p.unit} · проверено {p.checkedAt} ·{' '}
              <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-gold-600 underline-offset-2 hover:underline">
                источник
              </a>
              {p.edited ? ` · изменено вами (по умолчанию ${p.defaultValue})` : ''}
            </div>
          </div>
          <Input
            aria-label={p.label}
            inputMode="decimal"
            value={draft[p.key] ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
          />
        </div>
      ))}
      <div>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить цены
        </Button>
      </div>
    </Card>
  );
}
