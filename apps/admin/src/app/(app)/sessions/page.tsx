'use client';

import { Devices, SignOut } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { ROLE_LABEL, type AdminRole } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

/** Who is in the panel right now: the super admin watches and can end any session. */
export default function SessionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const list = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: async () => (await api.GET('/admin/sessions')).data!.data,
    refetchInterval: 15_000,
  });
  const revoke = useMutation({
    mutationFn: async (v: { id: string; who: string }) => {
      const ok = await confirm({
        title: `Завершить сессию ${v.who}?`,
        description: 'Админ будет разлогинен на следующем действии и должен войти заново.',
        confirm: 'Завершить',
        danger: true,
      });
      if (!ok) return false;
      await api.POST('/admin/sessions/{sessionId}/revoke', { params: { path: { sessionId: v.id } } });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Сессия завершена');
      void qc.invalidateQueries({ queryKey: ['admin-sessions'] });
    },
    onError: (e) => toast.error(e),
  });
  const rows = list.data ?? [];

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Система"
        title="Сессии админов"
        subtitle="Кто сейчас вошёл, откуда и что делал последним. Обновляется каждые 15 секунд. Все действия также пишутся в журнал аудита."
      />
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Админ</Th>
            <Th>Роль</Th>
            <Th>Вошёл</Th>
            <Th>Последнее действие</Th>
            <Th>Откуда</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.isPending ? <TableEmpty colSpan={6} loading /> : null}
          {!list.isPending && !list.error && rows.length === 0 ? (
            <TableEmpty colSpan={6}>
              <span className="inline-flex items-center gap-2">
                <Devices size={16} weight="light" /> Активных сессий нет
              </span>
            </TableEmpty>
          ) : null}
          {rows.map((s, i) => (
            <MotionRow key={s.sessionId} i={i}>
              <Td className="text-ink">
                <div>{s.login ?? s.email}</div>
                {s.login ? <div className="text-xs text-faint">{s.email}</div> : null}
                {s.current ? (
                  <Badge tone="gold" className="mt-1">
                    это вы
                  </Badge>
                ) : null}
              </Td>
              <Td>{ROLE_LABEL[s.role as AdminRole] ?? s.role}</Td>
              <Td className="whitespace-nowrap text-muted">{formatDateTime(s.createdAt)}</Td>
              <Td>
                <div className="font-mono text-xs text-ink">{s.lastAction ?? '—'}</div>
                <div className="text-xs text-faint">{formatDateTime(s.lastSeenAt)}</div>
              </Td>
              <Td className="text-muted">
                <div>{s.device ?? 'устройство неизвестно'}</div>
                <div className="font-mono text-xs text-faint">{s.ip ?? '—'}</div>
              </Td>
              <Td className="text-right">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: s.sessionId, who: s.login ?? s.email })}
                >
                  <SignOut size={14} /> Завершить
                </Button>
              </Td>
            </MotionRow>
          ))}
        </tbody>
      </Table>
    </>
  );
}
