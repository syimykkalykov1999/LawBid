'use client';

import { ShieldCheck, UserPlus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { ROLE_LABEL, type AdminRole } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

const ROLES = Object.keys(ROLE_LABEL) as AdminRole[];
type What = 'disable' | 'enable' | 'reset-2fa';
const DONE: Record<What, string> = {
  disable: 'Администратор отключён',
  enable: 'Администратор включён',
  'reset-2fa': '2FA сброшена, сессии завершены',
};

/** docs/06 §2.3 item 13 — super_admin only. */
export default function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: me } = useMe();
  const list = useQuery({
    queryKey: ['admins'],
    queryFn: async () => (await api.GET('/admin/admins')).data!.data,
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support');

  const refresh = () => qc.invalidateQueries({ queryKey: ['admins'] });

  const create = useMutation({
    mutationFn: () => api.POST('/admin/admins', { body: { email: email.trim(), role } }),
    onSuccess: () => {
      toast.success(`Аккаунт ${email.trim()} создан`);
      setEmail('');
      void refresh();
    },
    onError: (e) => toast.error(e),
  });
  const setRoleM = useMutation({
    mutationFn: async (v: { id: string; email: string; role: AdminRole }) => {
      const ok = await confirm({
        title: `Сменить роль ${v.email}?`,
        description: `Новая роль: ${ROLE_LABEL[v.role]}. Доступ к разделам изменится сразу.`,
        confirm: 'Сменить роль',
      });
      if (!ok) return null;
      await api.PATCH('/admin/admins/{id}/role', { params: { path: { id: v.id } }, body: { role: v.role } });
      return v;
    },
    onSuccess: (v) => {
      if (!v) return;
      toast.success(`Роль: ${ROLE_LABEL[v.role]}`);
      void refresh();
    },
    onError: (e) => toast.error(e),
  });
  const action = useMutation({
    mutationFn: async (v: { id: string; email: string; what: What }) => {
      const ok = await confirm(
        v.what === 'reset-2fa'
          ? {
              title: `Сбросить 2FA для ${v.email}?`,
              description: 'Все сессии будут завершены; при следующем входе нужно заново привязать аутентификатор.',
              confirm: 'Сбросить 2FA',
              danger: true,
            }
          : v.what === 'disable'
            ? {
                title: `Отключить ${v.email}?`,
                description: 'Вход будет заблокирован, сессии завершены.',
                confirm: 'Отключить',
                danger: true,
              }
            : { title: `Включить ${v.email}?`, confirm: 'Включить' },
      );
      if (!ok) return null;
      const path = { params: { path: { id: v.id } } };
      if (v.what === 'disable') await api.POST('/admin/admins/{id}/disable', path);
      else if (v.what === 'enable') await api.POST('/admin/admins/{id}/enable', path);
      else await api.POST('/admin/admins/{id}/reset-2fa', path);
      return v.what;
    },
    onSuccess: (w) => {
      if (!w) return;
      toast.success(DONE[w]);
      void refresh();
    },
    onError: (e) => toast.error(e),
  });
  const rows = list.data ?? [];

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Система"
        title="Администраторы"
        subtitle="Создание, роли, отключение, сброс 2FA. Регистрации нет: аккаунт создаёт супер-админ."
      />
      <form
        className="mb-6 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="new-email">Email</Label>
          <Input id="new-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor="new-role">Роль</Label>
          <Select id="new-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" loading={create.isPending}>
          <UserPlus size={16} weight="light" />
          Создать
        </Button>
      </form>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Email</Th>
            <Th>Роль</Th>
            <Th>Статус</Th>
            <Th>2FA</Th>
            <Th>Последний вход</Th>
            <Th>Создан</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.isPending ? <TableEmpty colSpan={7} loading /> : null}
          {!list.isPending && !list.error && rows.length === 0 ? (
            <TableEmpty colSpan={7}>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={16} weight="light" /> Администраторов пока нет
              </span>
            </TableEmpty>
          ) : null}
          {rows.map((a, i) => {
            const self = a.id === me?.id;
            return (
              <MotionRow key={a.id} i={i}>
                <Td className="text-ink">
                  {a.email}
                  {self ? <span className="ml-1 text-xs text-faint">(вы)</span> : null}
                </Td>
                <Td>
                  <Select
                    aria-label="Роль"
                    className="h-8 w-44"
                    value={a.role}
                    disabled={self || setRoleM.isPending}
                    onChange={(e) => setRoleM.mutate({ id: a.id, email: a.email, role: e.target.value as AdminRole })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  {a.status === 'active' ? (
                    <Badge tone="success" dot>
                      активен
                    </Badge>
                  ) : (
                    <Badge tone="danger" dot>
                      отключён
                    </Badge>
                  )}
                </Td>
                <Td>{a.totpEnabled ? <Badge tone="gold">привязана</Badge> : <Badge>нет</Badge>}</Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(a.lastLoginAt)}</Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(a.createdAt)}</Td>
                <Td className="whitespace-nowrap">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.isPending || !a.totpEnabled}
                      onClick={() => action.mutate({ id: a.id, email: a.email, what: 'reset-2fa' })}
                    >
                      Сбросить 2FA
                    </Button>
                    {a.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={self || action.isPending}
                        onClick={() => action.mutate({ id: a.id, email: a.email, what: 'disable' })}
                      >
                        Отключить
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() => action.mutate({ id: a.id, email: a.email, what: 'enable' })}
                      >
                        Включить
                      </Button>
                    )}
                  </div>
                </Td>
              </MotionRow>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
