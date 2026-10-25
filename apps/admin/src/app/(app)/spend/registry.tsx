'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorNote, SectionTitle } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import {
  autoRows,
  COST_KIND_TITLE,
  COST_NEEDED_WORD,
  COST_STATE_WORD,
  dayOneRows,
  groupByKind,
  money,
  switchableRows,
  usdRange,
  usersWord,
  type CostRegistryReport,
  type CostRegistryRow,
  type CostState,
} from '@/lib/launch';
import { livePoll } from '@/lib/live';

const KEY = ['spend-registry'];
const STATES: CostState[] = ['off', 'on', 'auto'];

/**
 * Owner 2026-10-25: every billable thing in one list, with this month's real
 * number and a three-position switch Выкл / Вкл / Авто. Items that live in
 * Terraform show the exact steps instead of a button.
 */
export function CostRegistry() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.GET('/admin/spend/registry')).data!.data as CostRegistryReport,
    refetchInterval: livePoll(),
  });
  const setMode = useMutation({
    mutationFn: async (v: { id: string; state: CostState }) =>
      (await api.PATCH('/admin/spend/registry/{id}/mode', { params: { path: { id: v.id } }, body: { state: v.state } })).data!
        .data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success('Переключатель сохранён и записан в журнал действий');
    },
    onError: (e) => toast.error(e),
  });
  const r = q.data;
  return (
    <>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {!r ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <Ladder report={r} />
          <SectionTitle>Все платные пункты: состояние, деньги, как переключить</SectionTitle>
          {r.unclaimed.length > 0 ? (
            <Card className="mb-3 border-warning p-3 text-sm" data-testid="registry-unclaimed">
              В счёте AWS есть строки, которых нет в списке ниже:{' '}
              {r.unclaimed.map((u) => `${u.service} (${money(u.usd)})`).join(', ')}. Скажите Claude добавить их в реестр.
            </Card>
          ) : null}
          {groupByKind(r.rows).map(([kind, rows]) => (
            <div key={kind} className="mb-6">
              <div className="mb-2 text-sm font-medium text-heading">{COST_KIND_TITLE[kind] ?? kind}</div>
              <div className="flex flex-col gap-2">
                {rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    busy={setMode.isPending && setMode.variables?.id === row.id}
                    onPick={(state) => setMode.mutate({ id: row.id, state })}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function Ladder({ report }: { report: CostRegistryReport }) {
  const { ladder, rows } = report;
  const dayOne = dayOneRows(rows);
  const sw = switchableRows(rows);
  const auto = autoRows(rows);
  return (
    <>
      <SectionTitle>Лестница расходов</SectionTitle>
      <Card className="mb-3 p-5" data-testid="ladder-day-one">
        <div className="text-xs text-muted">День первый: пустое приложение, платим за каждую строку</div>
        <div className="mt-1 text-3xl font-semibold text-heading">≈ {usdRange(ladder.dayOne.all)} в месяц</div>
        <p className="mt-1 text-sm text-muted">
          AWS {usdRange(ladder.dayOne.aws)} + сторонние и аккаунты {usdRange(ladder.dayOne.vendors)}. Старые документы писали «$150–170»: это было занижено примерно на $100.
        </p>
        <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {dayOne.map((d) => (
            <div key={d.id} className="flex items-baseline justify-between gap-3 border-b border-line py-1">
              <span className="min-w-0 truncate text-ink" title={d.purpose}>
                {d.name}
              </span>
              <span className="shrink-0 text-muted">{usdRange(d.usdLaunch)}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <Card className="p-4" data-testid="ladder-switchable">
          <div className="text-sm font-medium text-heading">Включаете вы сами (сейчас выключено)</div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {sw.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-ink" title={s.neededNote}>
                  {s.name}
                </span>
                <span className="shrink-0 text-muted">+{usdRange(s.ifOnUsd)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4" data-testid="ladder-auto">
          <div className="text-sm font-medium text-heading">Включается само, по сигналу (Авто)</div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {auto.map((s) => (
              <li key={s.id}>
                <span className="text-ink">{s.name}</span>
                <span className="block text-xs text-muted">{s.neededNote}</span>
                {s.ceilingLabel ? <span className="block text-xs text-muted">Потолок: {s.ceilingLabel}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mb-6 p-4" data-testid="ladder-scenarios">
        <div className="text-sm font-medium text-heading">Сколько в месяц при росте (грубо: в 2 раза можно ошибиться)</div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {ladder.scenarios.map((s) => (
            <div key={s.users}>
              <div className="text-xs text-muted">{usersWord(s.users)} человек</div>
              <div className="text-lg font-semibold text-heading">{usdRange(s.usd)}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Сейчас фактически за месяц: {money(ladder.monthToDateUsd)}, прогноз на месяц: {money(ladder.projectedUsd)}.
        </p>
      </Card>
    </>
  );
}

function Row({ row, busy, onPick }: { row: CostRegistryRow; busy: boolean; onPick: (s: CostState) => void }) {
  const stepsStates = row.states.length > 0 ? row.states : ['on'];
  return (
    <Card className="p-3" data-testid={`registry-${row.id}`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium text-heading">{row.name}</div>
          <p className="text-xs text-muted">{row.purpose}</p>
          {row.ceilingLabel ? <p className="mt-1 text-xs text-muted">Потолок: {row.ceilingLabel}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <StateControl row={row} busy={busy} onPick={onPick} />
          {row.stateNote ? <p className="max-w-[260px] text-xs text-warning">{row.stateNote}</p> : null}
          {row.lockedReason && !row.editable ? <p className="max-w-[260px] text-xs text-muted">{row.lockedReason}</p> : null}
        </div>
        <div className="text-sm">
          <div className="text-xs text-muted">Этот месяц · прогноз</div>
          <div className="text-ink" data-testid={`registry-money-${row.id}`}>
            {row.monthUsd == null ? 'нет данных' : `${money(row.monthUsd)} · ${money(row.projectedUsd)}`}
          </div>
          <div className="text-xs text-muted">
            Старт {usdRange(row.usdLaunch)} · 100 тыс. {usdRange(row.usdK100)} · 1 млн {usdRange(row.usdM1)}
            {row.ifOnUsd ? ` · если включить +${usdRange(row.ifOnUsd)}` : ''}
          </div>
          <div className="text-xs text-muted">
            {row.priceText}{' '}
            <a href={row.priceSourceUrl} target="_blank" rel="noreferrer" className="text-gold-600 underline-offset-2 hover:underline">
              цена на {row.priceCheckedAt}
            </a>
            {row.priceVerified ? '' : ' (уточнить)'}
          </div>
        </div>
        <div className="min-w-0 text-sm">
          <Badge tone={row.needed === 'yes' || row.needed === 'auto' ? 'success' : 'neutral'}>{COST_NEEDED_WORD[row.needed]}</Badge>
          <p className="mt-1 text-xs text-ink">{row.neededNote}</p>
          {row.alarm ? <p className="mt-1 text-xs text-muted">Тревога: {row.alarm}</p> : null}
        </div>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-gold-600">Как включить / выключить</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {stepsStates.map((st) => (
            <div key={st}>
              <div className="text-xs font-medium text-heading">{COST_STATE_WORD[st as CostState]}</div>
              <ol className="ml-4 list-decimal text-xs text-ink">
                {(row.steps[st] ?? []).map((s, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {s}
                  </li>
                ))}
              </ol>
              {row.stateHints[st] ? <p className="mt-1 text-xs text-muted">{row.stateHints[st]}</p> : null}
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}

function StateControl({ row, busy, onPick }: { row: CostRegistryRow; busy: boolean; onPick: (s: CostState) => void }) {
  return (
    <div role="radiogroup" aria-label={`Состояние: ${row.name}`} className="inline-flex overflow-hidden rounded-xl border border-line">
      {STATES.map((st) => {
        const supported = row.states.includes(st);
        const active = row.state === st;
        const can = row.editable && supported && !busy && !active;
        return (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!can && !active}
            title={!supported ? 'Для этого пункта такого положения нет' : (row.stateHints[st] ?? '')}
            data-testid={`state-${row.id}-${st}`}
            onClick={() => can && onPick(st)}
            className={[
              'h-9 px-3 text-sm transition-colors',
              active ? 'bg-gold-600 text-white' : 'bg-surface text-ink',
              supported ? '' : 'opacity-30',
              can ? 'hover:bg-line/40' : 'cursor-default',
            ].join(' ')}
          >
            {COST_STATE_WORD[st]}
          </button>
        );
      })}
    </div>
  );
}
