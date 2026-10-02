'use client';

import { Key, LockSimple, ShieldCheck, SlidersHorizontal, UserPlus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { GRANTABLE_AREAS, LOCKED_AREAS, ROLE_LABEL, type AccessLevel, type AdminRole } from '@/lib/rbac';
import { cn, formatDateTime } from '@/lib/utils';

type Account = components['schemas']['AdminAccountDto'];

const ROLES = Object.keys(ROLE_LABEL) as AdminRole[];
type What = 'disable' | 'enable' | 'reset-2fa';
const DONE: Record<What, string> = {
  disable: 'Администратор отключён',
  enable: 'Администратор включён',
  'reset-2fa': '2FA сброшена, сессии завершены',
};

/** docs/06 §2.3 item 13 — super_admin only. Role = label and starting set of
 * toggles; the real access is the per-area toggles ("Права"). */
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
  const [rights, setRights] = useState<Account | null>(null);
  const [creds, setCreds] = useState<Account | null>(null);

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
      <RightsDialog account={rights} onClose={() => setRights(null)} onSaved={() => void refresh()} />
      <CredentialsDialog account={creds} onClose={() => setCreds(null)} onSaved={() => void refresh()} />
      <PageHeader
        eyebrow="Система"
        title="Администраторы"
        subtitle="Создание, права по разделам, логин и пароль, отключение, сброс 2FA. Регистрации нет: аккаунт создаёт супер-админ. Деньги и ключи сервисов обычным админам недоступны никогда."
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
            <Th>Админ</Th>
            <Th>Роль</Th>
            <Th>Доступ</Th>
            <Th>Статус</Th>
            <Th>2FA</Th>
            <Th>Вход</Th>
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
                  <div>
                    {a.login ?? a.email}
                    {self ? <span className="ml-1 text-xs text-faint">(вы)</span> : null}
                  </div>
                  <div className="text-xs text-faint">
                    {a.login ? `${a.email} · ` : ''}
                    {a.hasPassword ? 'пароль задан' : 'без пароля (вход по коду из почты)'}
                  </div>
                </Td>
                <Td>
                  <Select
                    aria-label="Роль"
                    className="h-8 w-36"
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
                  {a.role === 'super_admin' ? (
                    <Badge tone="gold">всё</Badge>
                  ) : (
                    <Badge tone={Object.keys(a.permissions).length ? 'info' : 'neutral'}>
                      {Object.keys(a.permissions).length
                        ? `${Object.keys(a.permissions).length} разд.`
                        : 'нет разделов'}
                    </Badge>
                  )}
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
                <Td className="whitespace-nowrap text-muted">
                  <div>{formatDateTime(a.lastLoginAt)}</div>
                  <div className="text-xs text-faint">создан {formatDateTime(a.createdAt)}</div>
                </Td>
                <Td>
                  <div className="ml-auto flex max-w-[15rem] flex-wrap justify-end gap-1.5">
                    {a.role !== 'super_admin' ? (
                      <Button size="sm" variant="outline" onClick={() => setRights(a)}>
                        <SlidersHorizontal size={14} /> Права
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setCreds(a)}>
                      <Key size={14} /> Логин и пароль
                    </Button>
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

const LEVELS: { value: AccessLevel | 'none'; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'view', label: 'Смотреть' },
  { value: 'manage', label: 'Управлять' },
];

/** Per-area toggles. Applies at once, no sign-out needed. */
function RightsDialog({
  account,
  onClose,
  onSaved,
}: {
  account: Account | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  return (
    <Dialog
      open={!!account}
      onClose={onClose}
      wide
      eyebrow="Права доступа"
      title={account ? `Что может ${account.login ?? account.email}` : undefined}
      description="Для каждого раздела: не видит, только смотрит или управляет. Изменение действует сразу."
    >
      {account ? (
        <RightsForm
          key={account.id}
          account={account}
          onCancel={onClose}
          onSaved={() => {
            toast.success('Права сохранены');
            onSaved();
            onClose();
          }}
          onError={(e) => toast.error(e)}
        />
      ) : null}
    </Dialog>
  );
}

function RightsForm({
  account,
  onCancel,
  onSaved,
  onError,
}: {
  account: Account;
  onCancel: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [perms, setPerms] = useState<Record<string, AccessLevel>>({ ...account.permissions });
  const save = useMutation({
    mutationFn: () =>
      api.PATCH('/admin/admins/{id}/permissions', {
        params: { path: { id: account.id } },
        body: { permissions: perms },
      }),
    onSuccess: onSaved,
    onError,
  });
  const set = (key: string, v: AccessLevel | 'none') =>
    setPerms((p) => {
      const next = { ...p };
      if (v === 'none') delete next[key];
      else next[key] = v;
      return next;
    });
  const preset = (level: AccessLevel | 'none') =>
    setPerms(level === 'none' ? {} : Object.fromEntries(GRANTABLE_AREAS.map((a) => [a.key, level])));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => preset('view')}>
          Всё: смотреть
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => preset('manage')}>
          Всё: управлять
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => preset('none')}>
          Снять всё
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
        {GRANTABLE_AREAS.map((a) => {
          const cur = perms[a.key] ?? 'none';
          return (
            <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-ink">{a.label}</div>
                <div className="text-xs text-faint">{a.hint}</div>
              </div>
              <div role="radiogroup" aria-label={a.label} className="flex rounded-xl border border-line bg-surface-2 p-0.5">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    role="radio"
                    aria-checked={cur === l.value}
                    onClick={() => set(a.key, l.value)}
                    className={cn(
                      'rounded-[10px] px-3 py-1 text-xs transition-colors',
                      cur === l.value
                        ? l.value === 'manage'
                          ? 'bg-gold font-medium text-[#0b0b0d] shadow-card'
                          : 'bg-surface font-medium text-ink shadow-card'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-line px-3.5 py-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
          <LockSimple size={13} /> Закрыто навсегда
        </div>
        <ul className="space-y-1 text-xs text-muted">
          {LOCKED_AREAS.map((l) => (
            <li key={l.label}>
              <span className="text-ink">{l.label}</span> — {l.hint}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить права
        </Button>
      </div>
    </div>
  );
}

/** Super admin sets another admin's login and/or password (needs a fresh 2FA code). */
function CredentialsDialog({
  account,
  onClose,
  onSaved,
}: {
  account: Account | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [stepUp, setStepUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setLogin('');
    setPassword('');
    setError(null);
    setStepUp(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      api.PUT('/admin/admins/{id}/credentials', {
        params: { path: { id: account!.id } },
        body: { login: login.trim() || undefined, password: password || undefined },
      }),
    onSuccess: () => {
      toast.success('Сохранено. Сессии этого админа завершены.');
      onSaved();
      close();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
        setStepUp(true);
        return;
      }
      setError(errorText(e));
    },
  });

  return (
    <>
      <Dialog
        open={!!account && !stepUp}
        onClose={close}
        eyebrow="Вход"
        title={account ? `Логин и пароль: ${account.login ?? account.email}` : undefined}
        description="Заполните только то, что нужно изменить. Новый пароль передайте человеку лично, не в общем чате. Админ может сам сменить его в «Профиле»."
      >
        <form
          className="space-y-3.5"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="c-login">Логин {account?.login ? <span className="text-faint">(сейчас: {account.login})</span> : null}</Label>
            <Input
              id="c-login"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="латиница, цифры, точка, дефис"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-pass">Новый пароль</Label>
            <Input
              id="c-pass"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-faint">От 10 символов, буквы и цифры, без логина внутри.</p>
          </div>
          <ErrorNote text={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Отмена
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!login.trim() && !password}>
              Сохранить
            </Button>
          </div>
        </form>
      </Dialog>
      <StepUpDialog
        open={!!account && stepUp}
        description="Смена чужого логина или пароля требует свежий 6-значный код. Он действует 5 минут."
        onCancel={close}
        onDone={() => {
          setStepUp(false);
          save.mutate();
        }}
      />
    </>
  );
}
