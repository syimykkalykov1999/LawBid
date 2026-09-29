'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { ROLE_LABEL, type AdminRole } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

const ROLES = Object.keys(ROLE_LABEL) as AdminRole[];

/** docs/06 §2.3 item 13 — super_admin only. */
export default function AdminsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const list = useQuery({
    queryKey: ['admins'],
    queryFn: async () => (await api.GET('/admin/admins')).data!.data,
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admins'] });
  const onError = (e: unknown) => setError(errorText(e));

  const create = useMutation({
    mutationFn: () => api.POST('/admin/admins', { body: { email, role } }),
    onSuccess: () => {
      setEmail('');
      setError(null);
      void refresh();
    },
    onError,
  });
  const setRoleM = useMutation({
    mutationFn: (v: { id: string; role: AdminRole }) =>
      api.PATCH('/admin/admins/{id}/role', {
        params: { path: { id: v.id } },
        body: { role: v.role },
      }),
    onSuccess: () => void refresh(),
    onError,
  });
  const action = useMutation({
    mutationFn: (v: {
      id: string;
      what: 'disable' | 'enable' | 'reset-2fa';
    }) =>
      v.what === 'disable'
        ? api.POST('/admin/admins/{id}/disable', {
            params: { path: { id: v.id } },
          })
        : v.what === 'enable'
          ? api.POST('/admin/admins/{id}/enable', {
              params: { path: { id: v.id } },
            })
          : api.POST('/admin/admins/{id}/reset-2fa', {
              params: { path: { id: v.id } },
            }),
    onSuccess: () => void refresh(),
    onError,
  });

  return (
    <>
      <PageHeader
        title="Администраторы"
        subtitle="Создание, роли, отключение, сброс 2FA. Регистрации нет: аккаунт создаёт супер-админ."
      />
      <form
        className="mb-6 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="new-email">Email</Label>
          <Input
            id="new-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor="new-role">Роль</Label>
          <Select
            id="new-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={create.isPending}>
          Создать
        </Button>
      </form>
      <ErrorNote text={error ?? (list.error ? errorText(list.error) : null)} />
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
          {(list.data ?? []).map((a) => {
            const self = a.id === me?.id;
            return (
              <tr key={a.id}>
                <Td>
                  {a.email}
                  {self ? (
                    <span className="ml-1 text-xs text-muted">(вы)</span>
                  ) : null}
                </Td>
                <Td>
                  <Select
                    aria-label="Роль"
                    className="h-8 w-44"
                    value={a.role}
                    disabled={self || setRoleM.isPending}
                    onChange={(e) =>
                      setRoleM.mutate({
                        id: a.id,
                        role: e.target.value as AdminRole,
                      })
                    }
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
                    <Badge tone="success">активен</Badge>
                  ) : (
                    <Badge tone="danger">отключён</Badge>
                  )}
                </Td>
                <Td>
                  {a.totpEnabled ? (
                    <Badge tone="gold">привязана</Badge>
                  ) : (
                    <Badge>нет</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  {formatDateTime(a.lastLoginAt)}
                </Td>
                <Td className="whitespace-nowrap">
                  {formatDateTime(a.createdAt)}
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.isPending || !a.totpEnabled}
                      onClick={() => {
                        if (
                          confirm(
                            `Сбросить 2FA для ${a.email}? Все сессии будут завершены.`,
                          )
                        ) {
                          action.mutate({ id: a.id, what: 'reset-2fa' });
                        }
                      }}
                    >
                      Сбросить 2FA
                    </Button>
                    {a.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={self || action.isPending}
                        onClick={() => {
                          if (confirm(`Отключить ${a.email}?`)) {
                            action.mutate({ id: a.id, what: 'disable' });
                          }
                        }}
                      >
                        Отключить
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({ id: a.id, what: 'enable' })
                        }
                      >
                        Включить
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
