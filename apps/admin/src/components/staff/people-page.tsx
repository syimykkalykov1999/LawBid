'use client';

import { Users } from '@phosphor-icons/react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { isOwner, usePeople } from '@/lib/staff-data';
import { dayLabel, STATUS_LABEL, SUGGESTION_KIND, WORKSPACE_NAME } from '@/lib/staff-labels';

/** «Люди»: the rating of the staff (latest nightly snapshot), worst first. */
export function PeoplePage() {
  const { data: me } = useMe();
  const [workspace, setWorkspace] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<'worst' | 'best'>('worst');
  const q = usePeople({ workspace: workspace || undefined, status: status || undefined, sort }, isOwner(me));
  const missing = q.data && !q.data.ok;
  const rows = q.data?.ok ? q.data.data.items : [];

  return (
    <>
      <PageHeader
        eyebrow="Команда и контроль"
        title="Люди и рейтинг"
        actions={
          <Link href="/desk" className="text-sm text-gold-600 hover:underline">
            Посмотреть столы сотрудников
          </Link>
        }
        subtitle={
          q.data?.ok && q.data.data.snapshotDate
            ? `Рейтинг на ${dayLabel(q.data.data.snapshotDate)}. Считается раз в ночь, из решений за последние 30 дней.`
            : 'Рейтинг считается раз в ночь, из решений за последние 30 дней.'
        }
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {missing ? (
        <EmptyState
          icon={Users}
          title="Рейтинг выключен"
          text="Включите переключатель «Ночной рейтинг и флаги сотрудников» в «Настройки». До этого раздел пустой, остальное работает как раньше."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Select aria-label="Пространство" value={workspace} onChange={(e) => setWorkspace(e.target.value)} className="w-52">
              <option value="">Все пространства</option>
              <option value="mass">{WORKSPACE_NAME.mass}</option>
              <option value="finance">{WORKSPACE_NAME.finance}</option>
            </Select>
            <Select aria-label="Уровень" value={status} onChange={(e) => setStatus(e.target.value)} className="w-52">
              <option value="">Все уровни</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Порядок" value={sort} onChange={(e) => setSort(e.target.value as 'worst' | 'best')} className="w-52">
              <option value="worst">Сначала слабые</option>
              <option value="best">Сначала лучшие</option>
            </Select>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Сотрудник</Th>
                <Th>Пространство</Th>
                <Th>Рейтинг</Th>
                <Th>Уровень</Th>
                <Th>Решений</Th>
                <Th>Предложения</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={6} loading={q.isPending}>
                  Рейтинга пока нет: он появится, когда у людей наберётся достаточно решений.
                </TableEmpty>
              ) : (
                rows.map((p) => {
                  const s = STATUS_LABEL[p.status] ?? STATUS_LABEL.ok;
                  return (
                    <tr key={p.adminId}>
                      <Td>
                        <Link href={`/staff/${p.adminId}`} className="font-medium text-heading hover:underline">
                          {p.name}
                        </Link>
                      </Td>
                      <Td>{WORKSPACE_NAME[p.workspace] ?? p.workspace}</Td>
                      <Td className="tabular-nums">{p.rating == null ? '—' : Math.round(p.rating)}</Td>
                      <Td>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </Td>
                      <Td className="tabular-nums">{p.decisions}</Td>
                      <Td className="text-sm text-muted">{p.openSuggestions.map((o) => SUGGESTION_KIND[o.kind] ?? o.kind).join(', ') || '—'}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </>
      )}
    </>
  );
}
