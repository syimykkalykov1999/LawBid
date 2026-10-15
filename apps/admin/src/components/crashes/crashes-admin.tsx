'use client';

import { Bug, CheckCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

/** Owner 2026-10-15: the app's own crash reports (free, our database). */
export function CrashesAdmin() {
  const { data: me } = useMe();
  const canWrite = can(me, 'settings', 'manage');
  const [days, setDays] = useState('7');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['crashes', days],
    queryFn: async () => (await api.GET('/admin/crashes', { params: { query: { days: Number(days) } } })).data!.data,
  });
  const rows = q.data ?? [];
  const people = rows.reduce((n, r) => n + r.devices, 0);
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <div className="text-xs text-muted">Разных ошибок</div>
          <div className="text-2xl font-semibold tabular-nums text-ink">{rows.length}</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-xs text-muted">Всего случаев</div>
          <div className="text-2xl font-semibold tabular-nums text-ink">{rows.reduce((n, r) => n + r.count, 0)}</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-xs text-muted">Телефонов задело (сумма по ошибкам)</div>
          <div className="text-2xl font-semibold tabular-nums text-ink">{people}</div>
        </Card>
      </div>
      <div className="mb-4">
        <Tabs
          size="sm"
          value={days}
          onChange={setDays}
          items={[
            { value: '1', label: 'Сутки' },
            { value: '7', label: '7 дней' },
            { value: '30', label: '30 дней' },
          ]}
        />
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {!q.isPending && !q.error && rows.length === 0 ? (
        <EmptyState icon={Bug} title="Вылетов нет" text="За этот период приложение не присылало ошибок." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Ошибка</Th>
              <Th className="text-right">Случаев</Th>
              <Th className="text-right">Телефонов</Th>
              <Th>Закрыло приложение</Th>
              <Th>Версии</Th>
              <Th>Последний раз</Th>
            </tr>
          </thead>
          <tbody>
            {q.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((g) => (
                <tr key={g.fingerprint} className="cursor-pointer" onClick={() => setOpen(g.fingerprint)}>
                  <Td className="max-w-[28rem] font-mono text-xs text-ink">{g.message}</Td>
                  <Td className="text-right tabular-nums">{g.count}</Td>
                  <Td className="text-right tabular-nums">{g.devices}</Td>
                  <Td>
                    {g.fatal > 0 ? (
                      <Badge tone="danger" dot>
                        {g.fatal}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="text-xs text-muted">{g.versions.join(', ')}</Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(g.lastAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {open ? <CrashDialog fingerprint={open} canWrite={canWrite} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function CrashDialog({ fingerprint, canWrite, onClose }: { fingerprint: string; canWrite: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const d = useQuery({
    queryKey: ['crash', fingerprint],
    queryFn: async () => (await api.GET('/admin/crashes/{fingerprint}', { params: { path: { fingerprint } } })).data!.data,
  });
  const fix = useMutation({
    mutationFn: async () => {
      await api.DELETE('/admin/crashes/{fingerprint}', { params: { path: { fingerprint } } });
    },
    onSuccess: () => {
      toast.success('Отмечено исправленным. Если ошибка вернётся, появится снова.');
      void qc.invalidateQueries({ queryKey: ['crashes'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const list = (title: string, items: { value: string; count: number }[] | undefined) => (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">{title}</div>
      <ul className="space-y-0.5 text-sm text-ink">
        {(items ?? []).map((i) => (
          <li key={i.value} className="flex justify-between gap-3">
            <span className="truncate">{i.value}</span>
            <span className="tabular-nums text-muted">{i.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Dialog open wide onClose={onClose} eyebrow="Вылет" title={d.data?.message ?? '…'}>
      <ErrorNote text={d.error ? errorText(d.error) : null} />
      {d.data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {list('Версии приложения', d.data.versions)}
            {list('Системы', d.data.systems)}
            {list('Телефоны', d.data.devices)}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Где упало (последний случай)</div>
            <pre className="max-h-72 overflow-auto rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink">
              {d.data.stack}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted">Последние случаи</div>
            <ul className="space-y-1 text-xs text-muted">
              {d.data.latest.map((c, i) => (
                <li key={i}>
                  {formatDateTime(c.at)} · {c.platform} · {c.deviceModel} · {c.osVersion} · v{c.appVersion} ({c.flavor})
                  {c.route ? ` · ${c.route}` : ''}
                  {c.fatal ? ' · закрыло приложение' : ''}
                </li>
              ))}
            </ul>
          </div>
          {canWrite ? (
            <div className="flex justify-end">
              <Button variant="soft" loading={fix.isPending} onClick={() => fix.mutate()}>
                <CheckCircle size={16} /> Исправлено
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
