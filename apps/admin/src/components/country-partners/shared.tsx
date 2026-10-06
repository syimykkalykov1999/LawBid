'use client';

import { Target } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/card';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import type { components } from '@/lib/api/schema';
import { GOAL_METRIC, GOAL_STATE, goalPercent, goalValue, periodLabel, SETTLEMENT_STATUS } from '@/lib/country-partners';
import { money } from '@/lib/payroll';

type Detail = components['schemas']['CountryPartnerDetailDto'];

/** Owner 2026-10-06: blocks shared by Партнёры стран and the partner's own page. */
export function MonthLine({ rows }: { rows: Detail['currentMonth'] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Пока нет оплат из этой страны.</p>;
  return (
    <div className="space-y-1 text-sm">
      {rows.map((m) => (
        <div key={m.currency} className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Оплачено: {money(m.grossCents, m.currency)}</span>
          <span>Возвраты: {money(m.refundsCents, m.currency)}</span>
          <span>Комиссии карт: {money(m.feesCents, m.currency)}</span>
          <span className="text-ink">Доля партнёра: {money(m.amountCents, m.currency)}</span>
        </div>
      ))}
    </div>
  );
}

export function Goals({ goals }: { goals: Detail['goals'] }) {
  if (goals.length === 0) return <p className="text-sm text-muted">Цели не заданы.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {goals.map((g) => (
        <div key={`${g.metric}-${g.deadline}`} className="rounded-[var(--radius-md)] border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink">
              <Target size={15} className="shrink-0" />
              <span className="truncate">{GOAL_METRIC[g.metric] ?? g.metric}</span>
            </span>
            <Badge tone={GOAL_STATE[g.state]?.tone ?? 'neutral'}>{GOAL_STATE[g.state]?.label ?? g.state}</Badge>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-gold" style={{ width: `${goalPercent(g.progress, g.target)}%` }} />
          </div>
          <div className="mt-1.5 text-xs text-muted">
            {goalValue(g.metric, g.progress)} из {goalValue(g.metric, g.target)} · до {g.deadline}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Settlements({ rows }: { rows: Detail['settlements'] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Месяц</Th>
          <Th>Оплачено</Th>
          <Th>Возвраты и комиссии</Th>
          <Th>Чистый доход</Th>
          <Th>Доля</Th>
          <Th>Статус</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <TableEmpty colSpan={6}>Первое начисление появится 1-го числа следующего месяца</TableEmpty> : null}
        {rows.map((s) => (
          <tr key={s.id}>
            <Td className="whitespace-nowrap text-ink">{periodLabel(s.period)}</Td>
            <Td className="tabular-nums">{money(s.grossCents, s.currency)}</Td>
            <Td className="tabular-nums text-muted">{money(s.refundsCents + s.feesCents, s.currency)}</Td>
            <Td className="tabular-nums">{money(s.netCents, s.currency)}</Td>
            <Td className="tabular-nums text-ink">
              {money(s.amountCents, s.currency)} <span className="text-xs text-faint">({s.sharePercent}%)</span>
            </Td>
            <Td>
              <Badge tone={SETTLEMENT_STATUS[s.status]?.tone ?? 'neutral'}>{SETTLEMENT_STATUS[s.status]?.label ?? s.status}</Badge>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

