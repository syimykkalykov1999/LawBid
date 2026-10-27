'use client';

import { ChartBar } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useMyDecisions } from '@/lib/desk-data';
import { formatDuration } from '@/lib/utils';

/**
 * «Проверено» / «Решённые»: my own closed items per day, from the nightly
 * counters (the day closes at night; today shows up tomorrow).
 */
export function DecisionsTab({ enabled }: { enabled: boolean }) {
  const q = useMyDecisions(enabled);
  if (q.isPending && enabled) return <Skeleton className="h-32 w-full" />;
  if (!q.data || !q.data.ok) {
    return (
      <EmptyState
        icon={ChartBar}
        title="Итоги дня пока не считаются"
        text="Когда владелец включит личный прогресс, здесь появятся ваши закрытые элементы по дням."
      />
    );
  }
  const { days, decidedTotal } = q.data.data;
  return (
    <div className="space-y-3">
      <Card className="p-4 text-sm text-muted">
        Закрыто за последние 30 дней: <span className="font-semibold text-heading tabular-nums">{decidedTotal}</span>. Цифры считаются ночью, сегодняшний день появится завтра.
      </Card>
      <Table>
        <thead>
          <tr>
            <Th>День</Th>
            <Th>Закрыто</Th>
            <Th>В среднем на элемент</Th>
            <Th>Вернулись после закрытия</Th>
            <Th>С опозданием</Th>
          </tr>
        </thead>
        <tbody>
          {days.length === 0 ? (
            <TableEmpty colSpan={5}>Пока нет данных за эти дни.</TableEmpty>
          ) : (
            days.map((d) => (
              <tr key={d.day}>
                <Td className="whitespace-nowrap">{d.day}</Td>
                <Td className="tabular-nums">{d.decided}</Td>
                <Td className="tabular-nums">{d.decided ? formatDuration(d.avgHandleSec) : '—'}</Td>
                <Td className="tabular-nums">{d.reopened}</Td>
                <Td className="tabular-nums">{d.lateSla}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
