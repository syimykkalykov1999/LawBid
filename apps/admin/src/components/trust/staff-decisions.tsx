'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { DateField } from '@/components/date-field';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Label } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { DOC_TYPE } from '@/lib/labels';
import { ROLE_LABEL, type AdminRole } from '@/lib/rbac';
import { attorneyName, formatSeconds, staffName, TrustLevelChip } from '@/lib/trust-labels';
import { cn, formatDateTime } from '@/lib/utils';

type Stats = components['schemas']['StaffDecisionStatsDto'];

const FAST_SECONDS = 60;

/** «С» / «По» (type="date") → ISO bounds: start of the first day, end of the last. */
type Period = { from: string; to: string };
type Bounds = { from?: string; to?: string };
function periodQuery(p: Period): Bounds {
  return {
    ...(p.from ? { from: new Date(`${p.from}T00:00:00`).toISOString() } : {}),
    ...(p.to ? { to: new Date(`${p.to}T23:59:59.999`).toISOString() } : {}),
  };
}

/**
 * Owner 2026-10-05 — «Решения сотрудников»: who pressed «Подтвердить» /
 * «Отклонить», how fast, and what happened to the attorneys they cleared.
 * The records are immutable (who, when, from which IP, what they saw).
 */
export function StaffDecisions() {
  const [adminId, setAdminId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>({ from: '', to: '' });
  const bounds = periodQuery(period);
  const q = useQuery({
    queryKey: ['trust-staff-decisions', bounds.from ?? '', bounds.to ?? ''],
    queryFn: async () => (await api.GET('/admin/trust/staff-decisions', { params: { query: bounds } })).data!.data,
  });
  const rows = q.data ?? [];
  const picked = rows.find((r) => r.admin.id === adminId) ?? null;

  return (
    <>
      <p className="mb-3 max-w-3xl rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-gold-600">
        Записи решений неизменяемы: кто, когда, с какого IP, какие документы и автопроверки видел. Удалить их нельзя, даже владельцу.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="sd-from">С</Label>
          <DateField id="sd-from" value={period.from} max={period.to || undefined} onChange={(e) => setPeriod({ ...period, from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-to">По</Label>
          <DateField id="sd-to" value={period.to} min={period.from || undefined} onChange={(e) => setPeriod({ ...period, to: e.target.value })} />
        </div>
        <Button size="sm" variant="ghost" className="w-28 shrink-0" disabled={!period.from && !period.to} onClick={() => setPeriod({ from: '', to: '' })}>
          За всё время
        </Button>
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Сотрудник</Th>
            <Th>Подтвердил</Th>
            <Th>Отклонил</Th>
            <Th>Запросил документы</Th>
            <Th>Снял холды</Th>
            <Th>Медиана между решениями</Th>
            <Th>Быстрые решения (&lt;1 мин)</Th>
            <Th>Жалобы после одобрения</Th>
            <Th>Заблокированы после одобрения</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={10} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={10}>Решений сотрудников ещё не было.</TableEmpty>
          ) : (
            rows.map((r, i) => {
              const fast = r.fastDecisions > 0 || (r.medianSecondsBetween != null && r.medianSecondsBetween < FAST_SECONDS);
              const bad = r.laterComplaints > 0 || r.laterSuspended > 0;
              const active = r.admin.id === adminId;
              return (
                <MotionRow
                  key={r.admin.id}
                  i={i}
                  className={cn('cursor-pointer', fast && 'bg-warning-soft/40', active && 'outline outline-1 outline-gold/50')}
                  onClick={() => setAdminId(active ? null : r.admin.id)}
                >
                  <Td>
                    <div className="font-medium text-heading">{staffName(r.admin)}</div>
                    <div className="text-xs text-faint">
                      {r.admin.email ?? '—'}
                      {r.admin.role ? ` · ${ROLE_LABEL[r.admin.role as AdminRole] ?? r.admin.role}` : ''}
                    </div>
                    <div className="text-xs text-faint">
                      {formatDateTime(r.firstDecisionAt)} — {formatDateTime(r.lastDecisionAt)}
                    </div>
                  </Td>
                  <Td className="tabular-nums">
                    {r.cleared}
                    {r.uncleared ? <span className="text-xs text-muted"> (снял: {r.uncleared})</span> : null}
                  </Td>
                  <Td className="tabular-nums">{r.rejected}</Td>
                  <Td className="tabular-nums">{r.documentsRequested}</Td>
                  <Td className="tabular-nums">{r.released}</Td>
                  <Td className={cn('tabular-nums', r.medianSecondsBetween != null && r.medianSecondsBetween < FAST_SECONDS && 'font-medium text-warning')}>
                    {formatSeconds(r.medianSecondsBetween)}
                  </Td>
                  <Td className={cn('tabular-nums', r.fastDecisions > 0 && 'font-medium text-warning')}>{r.fastDecisions}</Td>
                  <Td className={cn('tabular-nums', r.laterComplaints > 0 && 'font-medium text-danger')}>{r.laterComplaints}</Td>
                  <Td className={cn('tabular-nums', r.laterSuspended > 0 && 'font-medium text-danger')}>{r.laterSuspended}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant={active ? 'soft' : 'ghost'}
                        className="w-32"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdminId(active ? null : r.admin.id);
                        }}
                      >
                        {active ? 'Скрыть' : 'Кого одобрил'}
                      </Button>
                    </div>
                    {bad ? (
                      <div className="mt-1 text-right">
                        <Badge tone="danger">проверить</Badge>
                      </div>
                    ) : null}
                  </Td>
                </MotionRow>
              );
            })
          )}
        </tbody>
      </Table>
      {picked ? <ClearedBy admin={picked} bounds={bounds} /> : null}
    </>
  );
}

function ClearedBy({ admin, bounds }: { admin: Stats; bounds: Bounds }) {
  const adminId = admin.admin.id;
  const q = useQuery({
    queryKey: ['trust-cleared-by', adminId, bounds.from ?? '', bounds.to ?? ''],
    queryFn: async () => (await api.GET('/admin/trust/cleared-by', { params: { query: { adminId, ...bounds } } })).data!.data,
  });
  const rows = q.data ?? [];
  return (
    <section>
      <SectionTitle>Кого одобрил: {staffName(admin.admin)}</SectionTitle>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Адвокат</Th>
            <Th>Уровень</Th>
            <Th>Одобрен</Th>
            <Th>Какие документы видел</Th>
            <Th>Жалобы после одобрения</Th>
            <Th>Заблокирован после одобрения</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>Этот сотрудник никого не подтверждал.</TableEmpty>
          ) : (
            rows.map((r, i) => (
              <MotionRow key={`${r.attorney.id}-${r.clearedAt}`} i={i} className={cn((r.complaintsAfter > 0 || r.suspendedAfter) && 'bg-danger-soft/30')}>
                <Td>
                  <Link href={`/verification/trust/${r.attorney.id}`} className="font-medium text-heading hover:underline">
                    {attorneyName(r.attorney)}
                  </Link>
                  <div className="text-xs text-faint">@{r.attorney.username}</div>
                </Td>
                <Td>
                  <TrustLevelChip level={r.level} />
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(r.clearedAt)}</Td>
                <Td className="text-xs">{r.documentsSeen.length ? r.documentsSeen.map((d) => DOC_TYPE[d] ?? d).join(', ') : <span className="text-muted">без документов</span>}</Td>
                <Td className={cn('tabular-nums', r.complaintsAfter > 0 && 'font-medium text-danger')}>{r.complaintsAfter}</Td>
                <Td>{r.suspendedAfter ? <Badge tone="danger" dot>да</Badge> : <span className="text-muted">нет</span>}</Td>
              </MotionRow>
            ))
          )}
        </tbody>
      </Table>
    </section>
  );
}
