'use client';

import { Copy, Key, LinkSimple, LockSimple, ShieldCheck, SlidersHorizontal, Trash, UserPlus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { ReasonPolicyCard } from '@/components/reason-policy-card';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import {
  GRANTABLE_AREAS,
  LOCKED_AREAS,
  PARTNER_TEAM_AREAS,
  ROLE_LABEL,
  WORKSPACE_HEAD_LABEL,
  WORKSPACE_LABEL,
  covers,
  fitToMe,
  summarizeRights,
  type AccessLevel,
  type AdminRole,
  type AdminWorkspace,
  type Permissions,
  workspaceCeiling,
} from '@/lib/rbac';
import { cn, formatDateTime } from '@/lib/utils';

type Account = components['schemas']['AdminAccountDto'];
type Template = components['schemas']['AdminRoleTemplateDto'];
type Preset = components['schemas']['AdminPresetDto'];
type Invite = components['schemas']['AdminInviteDto'];

/** Who is handing out rights: the fields of `me` the page needs. */
type Granter = {
  role: AdminRole;
  permissions: Permissions;
  partnerLead?: boolean;
  workspace?: AdminWorkspace;
  workspaceHead?: boolean;
  workspacesEnabled?: boolean;
};

/** What the granter holds: their own toggles, or — for the head of a
 * workspace (staff package T2) — the ceiling of that workspace. */
function ownGrants(me: Granter | undefined): Permissions {
  if (me?.workspaceHead) return workspaceCeiling(me.workspace) ?? {};
  return me?.permissions ?? {};
}

/** Presets this admin may use: the owner all of them, a manager only those that fit inside their own access. */
function usablePresets(presets: Preset[], me: Granter | undefined): Preset[] {
  if (me?.role === 'super_admin') return presets;
  return presets.filter((p) => p.role !== 'super_admin' && !p.noPii && covers(ownGrants(me), fitToMe(p.permissions, me)) && Object.keys(fitToMe(p.permissions, me)).length === Object.keys(p.permissions).length);
}

/** A template, cut down to what this admin may hand out (the API caps it too). */
function fitTemplate(
  t: Template,
  me: Granter | undefined,
): Record<string, AccessLevel> {
  return fitToMe(t.permissions, me);
}

const ROLES = Object.keys(ROLE_LABEL) as AdminRole[];
type What = 'disable' | 'enable' | 'reset-2fa' | 'delete';
const DONE: Record<What, string> = {
  disable: 'Администратор отключён',
  enable: 'Администратор включён',
  'reset-2fa': '2FA сброшена, сессии завершены',
  delete: 'Администратор удалён',
};

/** docs/06 §2.3 item 13. The super admin, or an admin the super admin gave the
 * right to manage others (then only within their own access, which the API
 * enforces too). Role = label and starting set of toggles; the real access is
 * the per-area toggles ("Права"). */
export default function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data: me } = useMe();
  // Staff package T2: the owner can look at one workspace.
  const [wsFilter, setWsFilter] = useState<AdminWorkspace | ''>('');
  const list = useQuery({
    queryKey: ['admins', wsFilter],
    queryFn: async () =>
      (await api.GET('/admin/admins', { params: { query: wsFilter ? { workspace: wsFilter } : {} } })).data!.data,
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support');
  const [rights, setRights] = useState<Account | null>(null);
  const [creds, setCreds] = useState<Account | null>(null);
  const [manager, setManager] = useState(false);
  const [tplId, setTplId] = useState('');
  const [editTpl, setEditTpl] = useState<Template | 'new' | null>(null);
  // Owner 2026-10-16: invite = preset + e-mail → a one-time link to hand over.
  const [invEmail, setInvEmail] = useState('');
  const [invPreset, setInvPreset] = useState('');
  const [invNoPii, setInvNoPii] = useState<boolean | null>(null);
  const [invite, setInvite] = useState<{ email: string; link: Invite } | null>(null);
  const [stepUpFor, setStepUpFor] = useState<null | { kind: 'new' } | { kind: 're'; id: string; email: string }>(null);
  const presets = useQuery({
    queryKey: ['admin-presets'],
    queryFn: async () => (await api.GET('/admin/admins/presets')).data!.data,
  });
  const templates = useQuery({
    queryKey: ['admin-templates'],
    queryFn: async () => (await api.GET('/admin/admins/templates')).data!.data,
  });
  const isSuper = me?.role === 'super_admin';
  // Owner 2026-10-06: a country partner manages only their own staff.
  const partnerLead = me?.partnerLead === true;
  // Staff package T2: workspaces are on (the new column and buttons), and
  // the head of a workspace manages their own team.
  const spaces = me?.workspacesEnabled === true;
  const head = spaces && me?.workspaceHead === true;
  // Mirrors the API: a manager only reaches non-super, non-manager admins
  // whose access fits inside their own.
  const reach = (a: Account) =>
    isSuper ||
    (partnerLead
      ? a.countryPartnerId === me?.countryPartnerId && !a.partnerLead
      : head
        ? a.workspace === me?.workspace &&
          !a.workspaceHead &&
          a.role !== 'super_admin' &&
          !a.canManageAdmins &&
          !a.countryPartnerId &&
          covers(workspaceCeiling(me?.workspace) ?? {}, a.permissions)
        : a.role !== 'super_admin' &&
          !a.canManageAdmins &&
          !a.countryPartnerId &&
          covers(me?.permissions ?? {}, a.permissions));
  // A head hires into their own workspace: never an owner or a finance role.
  const roles = isSuper ? ROLES : ROLES.filter((r) => r !== 'super_admin' && !(head && r === 'finance'));

  const tpl = (templates.data ?? []).find((t) => t.id === tplId);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admins'] });
  const usable = usablePresets(presets.data ?? [], me);
  const chosen = usable.find((p) => p.key === invPreset);
  const noPiiNow = invNoPii ?? chosen?.noPii ?? false;

  const inviteM = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/admins/invites', {
          body: {
            email: invEmail.trim(),
            preset: invPreset,
            ...(isSuper ? { noPii: noPiiNow } : {}),
          },
        })
      ).data!.data,
    onSuccess: (r) => {
      setInvite({ email: r.admin.email, link: r.invite });
      setInvEmail('');
      setInvPreset('');
      setInvNoPii(null);
      void refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUpFor({ kind: 'new' });
      else toast.error(e);
    },
  });
  const reinviteM = useMutation({
    mutationFn: async (v: { id: string; email: string }) =>
      (await api.POST('/admin/admins/{id}/invite', { params: { path: { id: v.id } } })).data!.data,
    onSuccess: (r) => setInvite({ email: r.admin.email, link: r.invite }),
    onError: (e, v) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUpFor({ kind: 're', id: v.id, email: v.email });
      else toast.error(e);
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api.POST('/admin/admins', {
        body: {
          email: email.trim(),
          role,
          ...(tplId && tpl && !partnerLead ? { permissions: fitTemplate(tpl, me) } : {}),
          ...(isSuper && manager ? { canManageAdmins: true } : {}),
        },
      }),
    onSuccess: () => {
      toast.success(`Аккаунт ${email.trim()} создан. Теперь задайте ему логин и пароль.`);
      setEmail('');
      setManager(false);
      setTplId('');
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
  const setWorkspaceM = useMutation({
    mutationFn: async (v: { id: string; email: string; workspace: AdminWorkspace }) => {
      const ok = await confirm({
        title: `Перевести ${v.email} в «${WORKSPACE_LABEL[v.workspace]}»?`,
        description: 'Админ увидит только разделы этого пространства. Если он был главным, этот статус снимется. Действует сразу.',
        confirm: 'Перевести',
      });
      if (!ok) return null;
      await api.PATCH('/admin/admins/{id}/workspace', { params: { path: { id: v.id } }, body: { workspace: v.workspace } });
      return v;
    },
    onSuccess: (v) => {
      if (!v) return;
      toast.success(`Пространство: ${WORKSPACE_LABEL[v.workspace]}`);
      void refresh();
    },
    onError: (e) => toast.error(e),
  });
  const setHeadM = useMutation({
    mutationFn: async (v: { id: string; email: string; head: boolean }) => {
      const ok = await confirm({
        title: v.head ? `Сделать ${v.email} главным?` : `Снять главного: ${v.email}?`,
        description: v.head
          ? 'Главный принимает и отключает сотрудников и выдаёт им разделы, но только в своём пространстве и в пределах потолка. Деньги, ставки, ключи и других админов ему недоступны. В пространстве может быть один главный.'
          : 'Он снова станет обычным сотрудником пространства.',
        confirm: v.head ? 'Назначить главным' : 'Снять',
      });
      if (!ok) return null;
      await api.PATCH('/admin/admins/{id}/head', { params: { path: { id: v.id } }, body: { head: v.head } });
      return v;
    },
    onSuccess: (v) => {
      if (!v) return;
      toast.success(v.head ? 'Главный назначен' : 'Главный снят');
      void refresh();
    },
    onError: (e) => toast.error(e),
  });
  const action = useMutation({
    mutationFn: async (v: { id: string; email: string; what: What }) => {
      const ok = await confirm(
        v.what === 'delete'
          ? {
              title: `Удалить ${v.email}?`,
              description:
                'Аккаунт будет закрыт, логин и пароль стёрты, все сессии завершены. Вернуть его нельзя — только создать заново.',
              confirm: 'Удалить',
              danger: true,
            }
          : v.what === 'reset-2fa'
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
      if (v.what === 'delete') await api.DELETE('/admin/admins/{id}', path);
      else if (v.what === 'disable') await api.POST('/admin/admins/{id}/disable', path);
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
      <InviteLinkDialog invite={invite} onClose={() => setInvite(null)} />
      <StepUpDialog
        open={stepUpFor !== null}
        onCancel={() => setStepUpFor(null)}
        onDone={() => {
          const t = stepUpFor;
          setStepUpFor(null);
          if (t?.kind === 'new') inviteM.mutate();
          else if (t?.kind === 're') reinviteM.mutate({ id: t.id, email: t.email });
        }}
      />
      <RightsDialog account={rights} me={me} presets={presets.data ?? []} onClose={() => setRights(null)} onSaved={() => void refresh()} />
      <CredentialsDialog account={creds} onClose={() => setCreds(null)} onSaved={() => void refresh()} />
      <PageHeader
        eyebrow="Система"
        title="Администраторы"
        subtitle={
          partnerLead
            ? 'Ваша команда в вашей стране. Принимайте сотрудников в пределах лимита, выдавайте им простые разделы (проверка, модерация, поддержка, борьба с мошенниками, привлечение, бухгалтер только для просмотра), задавайте логин и пароль, отключайте. Деньги, цены, ключи, юр. документы и другие страны закрыты.'
            : isSuper
            ? 'Создание сотрудников, права по разделам, логин и пароль, отключение, удаление. Регистрации нет: аккаунты заводите вы или те, кому вы дали право управлять админами. Ключи сервисов, управление админами и сессии обычным админам недоступны никогда; деньги, экономику, лимиты расходов и журнал аудита выдаёте только вы.'
            : 'Вы можете принимать сотрудников, выдавать им доступ в рамках своего, задавать логин и пароль, отключать и удалять. Деньги, журнал аудита и сессии вы видите только для просмотра, ключи сервисов недоступны, а право заместителя, деньги и журнал аудита другим выдаёт только супер-админ.'
        }
      />
      {partnerLead ? null : (
        <form
          className="mb-4 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            inviteM.mutate();
          }}
        >
          <div className="mb-3">
            <h2 className="text-sm font-medium text-heading">Пригласить сотрудника</h2>
            <p className="text-xs text-faint">
              Выберите роль-пресет и почту. Письмо не отправляется: вы получите одноразовую ссылку на 72 часа и отправите
              её сами. По ссылке человек придумывает логин и пароль, потом включает 2FA в профиле. Права можно поправить
              после.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
            </div>
            <div className="w-56 space-y-1.5">
              <Label htmlFor="inv-preset">Пресет</Label>
              <Select
                id="inv-preset"
                required
                value={invPreset}
                onChange={(e) => {
                  setInvPreset(e.target.value);
                  setInvNoPii(null);
                }}
              >
                <option value="">Выберите…</option>
                {usable.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            {isSuper ? (
              <label className="flex h-10 items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-gold,#C9A24A)]"
                  checked={noPiiNow}
                  onChange={(e) => setInvNoPii(e.target.checked)}
                />
                Без персональных данных
              </label>
            ) : null}
            <Button type="submit" loading={inviteM.isPending} disabled={!invPreset}>
              <LinkSimple size={16} weight="light" />
              Создать приглашение
            </Button>
          </div>
          {chosen ? (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted">{chosen.description}</p>
              {chosen.dangerous ? (
                <p className="mb-1.5 text-xs text-danger">
                  Это второй владелец: он получит полный доступ, включая ключи сервисов и администраторов. Выдавайте только
                  тому, кому доверяете как себе.
                </p>
              ) : (
                <RightsSummaryView perms={fitToMe(chosen.permissions, me)} noPii={noPiiNow} manager={false} />
              )}
            </div>
          ) : null}
        </form>
      )}
      <details className="mb-6 rounded-[var(--radius-lg)] border border-line bg-surface shadow-card">
        <summary className="cursor-pointer px-4 py-3 text-sm text-muted">Создать вручную, без ссылки (запасной способ)</summary>
      <form
        className="flex flex-wrap items-end gap-3 border-t border-line p-4"
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
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className={partnerLead ? 'hidden' : 'w-56 space-y-1.5'}>
          <Label htmlFor="new-tpl">Шаблон прав</Label>
          <Select id="new-tpl" value={tplId} onChange={(e) => setTplId(e.target.value)}>
            <option value="">По роли (стандартные)</option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        {isSuper ? (
          <label className="flex h-10 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-gold,#C9A24A)]"
              checked={manager}
              onChange={(e) => setManager(e.target.checked)}
            />
            Доверенный заместитель
          </label>
        ) : null}
        <Button type="submit" loading={create.isPending}>
          <UserPlus size={16} weight="light" />
          Создать
        </Button>
      </form>
      </details>
      {isSuper ? <ReasonPolicyCard /> : null}
      {partnerLead ? null : <TemplatesCard
        templates={templates.data ?? []}
        loading={templates.isPending}
        onNew={() => setEditTpl('new')}
        onEdit={(t) => setEditTpl(t)}
        onChanged={() => void qc.invalidateQueries({ queryKey: ['admin-templates'] })}
      />}
      <TemplateDialog
        key={editTpl === null ? 'none' : editTpl === 'new' ? 'new' : editTpl.id}
        target={editTpl}
        me={me}
        onClose={() => setEditTpl(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ['admin-templates'] })}
      />
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {spaces && isSuper ? (
        <div className="mb-3 flex items-center gap-2">
          <Label htmlFor="ws-filter" className="mb-0">
            Пространство
          </Label>
          <Select id="ws-filter" className="h-9 w-56" value={wsFilter} onChange={(e) => setWsFilter(e.target.value as AdminWorkspace | '')}>
            <option value="">Все</option>
            {(Object.keys(WORKSPACE_LABEL) as AdminWorkspace[]).map((w) => (
              <option key={w} value={w}>
                {WORKSPACE_LABEL[w]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Table>
        <thead>
          <tr>
            <Th>Админ</Th>
            <Th>Роль</Th>
            {spaces ? <Th>Пространство</Th> : null}
            <Th>Доступ</Th>
            <Th>Статус</Th>
            <Th>2FA</Th>
            <Th>Вход</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.isPending ? <TableEmpty colSpan={spaces ? 8 : 7} loading /> : null}
          {!list.isPending && !list.error && rows.length === 0 ? (
            <TableEmpty colSpan={spaces ? 8 : 7}>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={16} weight="light" /> Администраторов пока нет
              </span>
            </TableEmpty>
          ) : null}
          {rows.map((a, i) => {
            const self = a.id === me?.id;
            const mine = reach(a) && (isSuper || !self);
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
                  {isSuper ? (
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
                  ) : (
                    <span className="text-sm text-ink">{ROLE_LABEL[a.role]}</span>
                  )}
                </Td>
                {spaces ? (
                  <Td>
                    <WorkspaceCell
                      a={a}
                      self={self}
                      isSuper={isSuper}
                      busy={setWorkspaceM.isPending || setHeadM.isPending}
                      onWorkspace={(workspace) => setWorkspaceM.mutate({ id: a.id, email: a.email, workspace })}
                      onHead={(h) => setHeadM.mutate({ id: a.id, email: a.email, head: h })}
                    />
                  </Td>
                ) : null}
                <Td>
                  {a.role === 'super_admin' ? (
                    <Badge tone="gold">всё</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={Object.keys(a.permissions).length ? 'info' : 'neutral'}>
                        {Object.keys(a.permissions).length
                          ? `${Object.keys(a.permissions).length} разд.`
                          : 'нет разделов'}
                      </Badge>
                      {a.canManageAdmins ? <Badge tone="gold">заместитель</Badge> : null}
                      {a.noPii ? <Badge tone="info" title="Телефоны, почты и имена людей скрыты">без ПД</Badge> : null}
                      {a.partnerLead ? (
                        <Badge tone="gold">партнёр страны</Badge>
                      ) : a.countryPartnerId ? (
                        <Badge tone="info">команда партнёра</Badge>
                      ) : null}
                      {(a.countries ?? []).length ? (
                        <Badge tone="neutral" title={(a.countries ?? []).join(', ')}>
                          {(a.countries ?? []).length > 3 ? `${(a.countries ?? []).length} стран` : (a.countries ?? []).join(' · ')}
                        </Badge>
                      ) : null}
                    </div>
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
                  {mine ? (
                    <div className="ml-auto flex max-w-[15rem] flex-wrap justify-end gap-1.5">
                      {a.role !== 'super_admin' && !self ? (
                        <Button size="sm" variant="outline" onClick={() => setRights(a)}>
                          <SlidersHorizontal size={14} /> Права
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => setCreds(a)}>
                        <Key size={14} /> Логин и пароль
                      </Button>
                      {a.status === 'active' && !self ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reinviteM.isPending}
                          title="Новая одноразовая ссылка на 72 часа; старая перестанет работать"
                          onClick={() => reinviteM.mutate({ id: a.id, email: a.email })}
                        >
                          <LinkSimple size={14} /> Ссылка
                        </Button>
                      ) : null}
                      {/* Owner 2026-10-22: only the super admin resets another admin's authenticator. */}
                      {isSuper && !self ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={action.isPending || !a.totpEnabled}
                          onClick={() => action.mutate({ id: a.id, email: a.email, what: 'reset-2fa' })}
                        >
                          Сбросить 2FA
                        </Button>
                      ) : null}
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
                      {/* Staff package T2: a head switches people off; deleting stays with the owner. */}
                      {head ? null : (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={self || action.isPending}
                          onClick={() => action.mutate({ id: a.id, email: a.email, what: 'delete' })}
                        >
                          <Trash size={14} /> Удалить
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-right text-xs text-faint">{self ? 'это вы' : 'вне вашего доступа'}</div>
                  )}
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
  me,
  presets,
  onClose,
  onSaved,
}: {
  account: Account | null;
  me: Granter | undefined;
  presets: Preset[];
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
          me={me}
          presets={presets}
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


type AreaDef = { key: string; label: string; hint: string };

function AreaToggles({
  areas,
  cap,
  perms,
  set,
}: {
  areas: readonly AreaDef[];
  cap: (key: string) => AccessLevel[];
  perms: Record<string, AccessLevel>;
  set: (key: string, v: AccessLevel | 'none') => void;
}) {
  return (
    <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
        {areas.map((a) => {
          const cur = perms[a.key] ?? 'none';
          return (
            <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-ink">{a.label}</div>
                <div className="text-xs text-faint">{a.hint}</div>
              </div>
              <div role="radiogroup" aria-label={a.label} className="flex rounded-xl border border-line bg-surface-2 p-0.5">
                {LEVELS.filter((l) => l.value === 'none' || cap(a.key).includes(l.value)).map((l) => (
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
  );
}

function RightsForm({
  account,
  me,
  presets,
  onCancel,
  onSaved,
  onError,
}: {
  account: Account;
  me: Granter | undefined;
  presets: Preset[];
  onCancel: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const isSuper = me?.role === 'super_admin';
  // A manager hands out only what they hold themselves (the API checks too).
  const own = ownGrants(me);
  // Owner 2026-10-06: a country partner's team gets only the partner areas.
  const partnerTeam = !!account.countryPartnerId;
  // Staff package T2: with workspaces on, a worker holds nothing outside
  // their workspace's ceiling, whoever hands it out (the API refuses it).
  const ceiling =
    me?.workspacesEnabled && !partnerTeam && !account.canManageAdmins && account.role !== 'super_admin'
      ? workspaceCeiling(account.workspace)
      : null;
  const pool = partnerTeam ? PARTNER_TEAM_AREAS : GRANTABLE_AREAS;
  const inCeiling = (key: string) => !ceiling || !!ceiling[key];
  const areas = (isSuper ? pool : pool.filter((a) => own[a.key] && !('ownerGrants' in a && a.ownerGrants))).filter((a) => inCeiling(a.key));
  const cap = (key: string): AccessLevel[] => {
    const max = PARTNER_TEAM_AREAS.find((a) => a.key === key)?.max;
    if (partnerTeam && max === 'view') return ['view'];
    if (ceiling && ceiling[key] === 'view') return ['view'];
    return isSuper || own[key] === 'manage' ? ['view', 'manage'] : ['view'];
  };
  const [perms, setPerms] = useState<Record<string, AccessLevel>>({ ...account.permissions });
  const [manager, setManager] = useState(account.canManageAdmins);
  const [noPii, setNoPii] = useState(account.noPii);
  const [countries, setCountries] = useState<string[]>(account.countries ?? []);
  const templates = useQuery({
    queryKey: ['admin-templates'],
    queryFn: async () => (await api.GET('/admin/admins/templates')).data!.data,
  });
  const save = useMutation({
    mutationFn: async () => {
      await api.PATCH('/admin/admins/{id}/permissions', {
        params: { path: { id: account.id } },
        body: { permissions: perms, ...(isSuper ? { canManageAdmins: manager, noPii } : {}) },
      });
      const before = [...(account.countries ?? [])].sort().join();
      if ([...countries].sort().join() !== before) {
        await api.PUT('/admin/admins/{id}/countries', { params: { path: { id: account.id } }, body: { countries } });
      }
    },
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
    setPerms(
      level === 'none' ? {} : Object.fromEntries(areas.map((a) => [a.key, cap(a.key).includes(level) ? level : 'view'])),
    );

  const usable = usablePresets(presets, me).filter((p) => p.role !== 'super_admin');
  return (
    <div>
      {usable.length > 0 && !partnerTeam ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Label htmlFor="rights-preset" className="mb-0">
            Пресет
          </Label>
          <Select
            id="rights-preset"
            className="h-9 w-64"
            value=""
            onChange={(e) => {
              const p = usable.find((x) => x.key === e.target.value);
              if (!p) return;
              setPerms(fitToMe(p.permissions, me));
              if (isSuper) setNoPii(p.noPii);
            }}
          >
            <option value="">Подставить пресет…</option>
            {usable.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
          <span className="text-xs text-faint">Заменяет галочки ниже, потом можно поправить.</span>
        </div>
      ) : null}
      {(templates.data ?? []).length > 0 && !partnerTeam ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Label htmlFor="rights-tpl" className="mb-0">
            Шаблон
          </Label>
          <Select
            id="rights-tpl"
            className="h-9 w-64"
            value=""
            onChange={(e) => {
              const t = (templates.data ?? []).find((x) => x.id === e.target.value);
              if (t) setPerms(fitTemplate(t, me));
            }}
          >
            <option value="">Подставить шаблон…</option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <span className="text-xs text-faint">Потом можно поправить вручную.</span>
        </div>
      ) : null}
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
      <AreaToggles areas={areas} cap={cap} perms={perms} set={set} />
      {partnerTeam ? (
        <p className="mt-3 text-xs text-muted">Страна: {(account.countries ?? []).join(', ')} (страна партнёра, не меняется).</p>
      ) : (
        <CountriesPicker value={countries} onChange={setCountries} />
      )}
      {isSuper && !partnerTeam ? (
        <label className="mt-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-line px-3.5 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-gold,#C9A24A)]"
            checked={manager}
            onChange={(e) => setManager(e.target.checked)}
          />
          <span>
            <span className="text-ink">Доверенный заместитель</span>
            <span className="block text-xs text-faint">
              Видит все разделы, включая деньги, журнал аудита и сессии (только просмотр), ведёт зарплаты, принимает и
              увольняет сотрудников и выдаёт доступ в рамках своего. Меняет данные только в разделах, где у него
              «управлять». Ключи сервисов и ваш пароль ему недоступны, и это право он никому не даёт.
            </span>
          </span>
        </label>
      ) : null}
      {isSuper && !partnerTeam ? (
        <label className="mt-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-line px-3.5 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-gold,#C9A24A)]"
            checked={noPii}
            onChange={(e) => setNoPii(e.target.checked)}
          />
          <span>
            <span className="text-ink">Без персональных данных</span>
            <span className="block text-xs text-faint">
              Для бухгалтера: телефоны, почты и имена людей приходят скрытыми (инициалы, последние цифры), выгрузки CSV и
              запросы госорганов закрыты. Действует сразу.
            </span>
          </span>
        </label>
      ) : null}
      {partnerTeam ? null : (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Итог: что сможет этот админ</div>
          <RightsSummaryView perms={perms} noPii={noPii} manager={manager} />
        </div>
      )}
      {/* Staff package T2: with workspaces on, the list of what is closed for good is the owner's to read. */}
      {me?.workspacesEnabled && !isSuper ? null : (
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
      )}
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

/**
 * Staff package T2: the workspace of one admin. The owner moves people
 * between workspaces and names the head (one per workspace, none in
 * finance); everybody else just reads it.
 */
function WorkspaceCell({
  a,
  self,
  isSuper,
  busy,
  onWorkspace,
  onHead,
}: {
  a: Account;
  self: boolean;
  isSuper: boolean;
  busy: boolean;
  onWorkspace: (w: AdminWorkspace) => void;
  onHead: (head: boolean) => void;
}) {
  const outside = a.canManageAdmins || !!a.countryPartnerId;
  if (a.role === 'super_admin' || outside || !isSuper) {
    return (
      <div className="flex flex-wrap gap-1">
        {outside ? (
          <Badge tone="neutral" title="Заместитель и команда партнёра стоят вне пространств">
            вне пространств
          </Badge>
        ) : (
          <Badge tone={a.workspace === 'owner' ? 'gold' : 'info'}>{WORKSPACE_LABEL[a.workspace]}</Badge>
        )}
        {a.workspaceHead ? <Badge tone="gold">{WORKSPACE_HEAD_LABEL}</Badge> : null}
      </div>
    );
  }
  const canBeHead = a.workspace === 'mass' && a.status === 'active';
  return (
    <div className="space-y-1.5">
      <Select
        aria-label="Пространство"
        className="h-8 w-44"
        value={a.workspace}
        disabled={self || busy}
        onChange={(e) => onWorkspace(e.target.value as AdminWorkspace)}
      >
        {(Object.keys(WORKSPACE_LABEL) as AdminWorkspace[]).map((w) => (
          <option key={w} value={w}>
            {WORKSPACE_LABEL[w]}
          </option>
        ))}
      </Select>
      {a.workspaceHead ? (
        <div className="flex items-center gap-1.5">
          <Badge tone="gold">{WORKSPACE_HEAD_LABEL}</Badge>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onHead(false)}>
            Снять
          </Button>
        </div>
      ) : canBeHead ? (
        <Button size="sm" variant="outline" disabled={self || busy} onClick={() => onHead(true)}>
          Сделать главным
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Owner 2026-10-05: the countries this employee works in. Someone hired to
 * check Canadian attorneys sees only Canadian people, cases and queues.
 * None picked = every country (a country-limited manager can only hand
 * out their own countries; the API checks too).
 */
function CountriesPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data: me } = useMe();
  const limited = (me?.countries ?? []).length > 0;
  const all = useQuery({
    queryKey: ['countries'],
    enabled: !limited,
    retry: false,
    queryFn: async () => (await api.GET('/admin/countries')).data!.data,
  });
  const names = new Map<string, string>();
  for (const t of me?.countryTabs ?? []) names.set(t.code, t.name);
  for (const c of all.data?.countries ?? []) if (!names.has(c.code)) names.set(c.code, c.name);
  const enabled = new Set((all.data?.countries ?? []).filter((c) => c.isEnabled).map((c) => c.code));
  for (const t of me?.countryTabs ?? []) enabled.add(t.code);
  // Enabled countries first, then the rest (staff can be prepared before a launch).
  const options = [...names.keys()]
    .filter((c) => !value.includes(c))
    .sort((a, b) => Number(enabled.has(b)) - Number(enabled.has(a)) || (names.get(a) ?? a).localeCompare(names.get(b) ?? b));
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-line px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-ink">Страны</div>
          <div className="text-xs text-faint">
            {value.length ? 'Видит людей, кейсы и очереди только этих стран.' : limited ? 'Выберите хотя бы одну из ваших стран.' : 'Все страны. Выберите, чтобы ограничить.'}
          </div>
        </div>
        <Select
          aria-label="Добавить страну"
          className="h-9 w-56 max-w-full"
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">Добавить страну…</option>
          {options.map((c) => (
            <option key={c} value={c}>
              {names.get(c) ?? c}
              {enabled.has(c) ? '' : ' (выключена)'}
            </option>
          ))}
        </Select>
      </div>
      {value.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(value.filter((x) => x !== c))}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs text-ink hover:border-danger/50"
              title="Убрать"
            >
              <span className="truncate">{names.get(c) ?? c}</span>
              <span aria-hidden className="text-faint">×</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Super admin or a manager sets another admin's login and/or password (needs a fresh confirmation). */
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
        description="Заполните только то, что нужно изменить. Новый пароль передайте человеку лично, не в общем чате. Сам админ сменить логин или пароль не может: это делаете вы."
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
        onCancel={close}
        onDone={() => {
          setStepUp(false);
          save.mutate();
        }}
      />
    </>
  );
}

/** Saved named sets of rights. */
function TemplatesCard({
  templates,
  loading,
  onNew,
  onEdit,
  onChanged,
}: {
  templates: Template[];
  loading: boolean;
  onNew: () => void;
  onEdit: (t: Template) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const remove = useMutation({
    mutationFn: async (t: Template) => {
      const ok = await confirm({
        title: `Удалить шаблон «${t.name}»?`,
        description: 'Админы, которым он уже применён, сохраняют свои права.',
        confirm: 'Удалить',
        danger: true,
      });
      if (!ok) return null;
      await api.DELETE('/admin/admins/templates/{id}', { params: { path: { id: t.id } } });
      return t;
    },
    onSuccess: (t) => {
      if (!t) return;
      toast.success('Шаблон удалён');
      onChanged();
    },
    onError: (e) => toast.error(e),
  });
  const label = (k: string) => GRANTABLE_AREAS.find((a) => a.key === k)?.label ?? k;
  return (
    <section className="mb-6 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-card">
      {dialog}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-heading">Шаблоны прав</h2>
          <p className="text-xs text-faint">
            Готовые наборы («Проверка», «Поддержка»…): выбираете при создании админа или в его правах и при желании
            правите вручную. Шаблон не может дать больше, чем есть у вас.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onNew}>
          Новый шаблон
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted">Загрузка…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted">Шаблонов пока нет.</p>
      ) : (
        <ul className="divide-y divide-line">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-sm text-ink">{t.name}</div>
                <div className="truncate text-xs text-faint">
                  {Object.entries(t.permissions)
                    .map(([k, v]) => `${label(k)}${v === 'manage' ? '' : ' (смотреть)'}`)
                    .join(' · ') || 'без доступа'}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => onEdit(t)}>
                  Изменить
                </Button>
                <Button size="sm" variant="danger-soft" loading={remove.isPending} onClick={() => remove.mutate(t)}>
                  <Trash size={14} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TemplateDialog({
  target,
  me,
  onClose,
  onSaved,
}: {
  target: Template | 'new' | null;
  me: { role: AdminRole; permissions: Permissions } | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isSuper = me?.role === 'super_admin';
  const own = me?.permissions ?? {};
  const areas = isSuper ? GRANTABLE_AREAS : GRANTABLE_AREAS.filter((a) => own[a.key] && !a.ownerGrants);
  const cap = (key: string): AccessLevel[] => (isSuper || own[key] === 'manage' ? ['view', 'manage'] : ['view']);
  const existing = target && target !== 'new' ? target : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [perms, setPerms] = useState<Record<string, AccessLevel>>({ ...(existing?.permissions ?? {}) } as Record<
    string,
    AccessLevel
  >);
  const set = (key: string, v: AccessLevel | 'none') =>
    setPerms((p) => {
      const next = { ...p };
      if (v === 'none') delete next[key];
      else next[key] = v;
      return next;
    });
  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), permissions: perms };
      if (existing) await api.PATCH('/admin/admins/templates/{id}', { params: { path: { id: existing.id } }, body });
      else await api.POST('/admin/admins/templates', { body });
    },
    onSuccess: () => {
      toast.success('Шаблон сохранён');
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      wide
      eyebrow="Шаблон прав"
      title={existing ? `Шаблон «${existing.name}»` : 'Новый шаблон'}
    >
      <div className="mb-3 space-y-1.5">
        <Label htmlFor="tpl-name">Название</Label>
        <Input id="tpl-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <AreaToggles areas={areas} cap={cap} perms={perms} set={set} />
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button type="button" loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate()}>
          Сохранить шаблон
        </Button>
      </div>
    </Dialog>
  );
}

/** What the toggles mean, in words: manage / view / closed (owner 2026-10-16). */
function RightsSummaryView({ perms, noPii, manager }: { perms: Record<string, AccessLevel>; noPii: boolean; manager: boolean }) {
  const sum = summarizeRights(perms);
  const money = perms.money === 'manage';
  return (
    <div className="space-y-1.5 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3.5 py-3 text-xs">
      <div>
        <span className="text-ink">Управляет:</span>{' '}
        <span className="text-muted">{sum.manage.length ? sum.manage.join(', ') : 'ничем'}</span>
      </div>
      <div>
        <span className="text-ink">Только смотрит:</span>{' '}
        <span className="text-muted">{sum.view.length ? sum.view.join(', ') : 'ничего'}</span>
      </div>
      <div>
        <span className="text-ink">Закрыто:</span>{' '}
        <span className="text-faint">{sum.closed.length ? sum.closed.join(', ') : 'ничего из выдаваемого'}</span>
      </div>
      {noPii ? (
        <div className="text-muted">Люди без телефонов, почт и имён; выгрузки CSV и запросы госорганов закрыты.</div>
      ) : (
        <div className="text-muted">Персональные данные людей видны там, где есть доступ.</div>
      )}
      {manager ? <div className="text-muted">Доверенный заместитель: читает все разделы, кроме ключей.</div> : null}
      {money ? (
        <div className="text-danger">
          «Деньги: управлять» даёт возвраты, выплаты партнёрам и промокоды. Для бухгалтера хватает «смотреть».
        </div>
      ) : null}
      <div className="text-faint">Ключи сервисов, управление админами и сессии не выдаются никому, кроме вас.</div>
    </div>
  );
}

/** The one-time link, shown once: copy it and send it yourself (no email is sent). */
function InviteLinkDialog({ invite, onClose }: { invite: { email: string; link: Invite } | null; onClose: () => void }) {
  const toast = useToast();
  const link = invite ? (invite.link.url ?? `${window.location.origin}/invite/${invite.link.token}`) : '';
  return (
    <Dialog
      open={!!invite}
      onClose={onClose}
      eyebrow="Приглашение"
      title={invite ? `Ссылка для ${invite.email}` : undefined}
      description="Письмо НЕ отправлено: скопируйте ссылку и отправьте человеку сами (мессенджер, почта). Она работает один раз и 72 часа, показывается только сейчас."
    >
      {invite ? (
        <div className="space-y-3">
          <Input readOnly aria-label="Ссылка-приглашение" value={link} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-xs text-faint">
            Действует до {formatDateTime(invite.link.expiresAt)}. По ссылке человек придумает логин и пароль, затем в профиле
            включит двухфакторную защиту. Потеряли ссылку — нажмите «Ссылка» у админа, старая перестанет работать.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
            <Button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(link)
                  .then(() => toast.success('Ссылка скопирована'))
                  .catch(() => toast.error('Не удалось скопировать: выделите ссылку и скопируйте вручную'));
              }}
            >
              <Copy size={16} /> Скопировать
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
