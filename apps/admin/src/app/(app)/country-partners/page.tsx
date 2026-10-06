'use client';

import { FileText, GlobeHemisphereWest, Plus, UsersThree } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { dateInput, dateToIso, GOAL_METRIC, PARTNER_STATUS } from '@/lib/country-partners';
import { ROLE_LABEL, type AdminRole } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';
import { Goals, MonthLine, Settlements } from '@/components/country-partners/shared';

type Detail = components['schemas']['CountryPartnerDetailDto'];
type Goal = components['schemas']['CountryPartnerGoalDto'];
type Create = components['schemas']['CreateCountryPartnerDto'];

/**
 * Owner 2026-10-06 — Деньги → Партнёры стран. A partner abroad promotes
 * LawBid in one country at their own cost and gets a share of that
 * country's net revenue, paid monthly through Зарплаты. You create them,
 * set the share, the staff limit and goals, switch payouts on, pause or
 * disable the whole team in one click. Money changes ask for a 2FA code.
 */
export default function CountryPartnersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const list = useQuery({
    queryKey: ['country-partners'],
    queryFn: async () => (await api.GET('/admin/country-partners')).data!.data,
  });
  const rows = list.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Партнёры стран"
        subtitle="Главный партнёр продвигает LawBid в своей стране за свой счёт и получает процент от чистого дохода этой страны. Все деньги идут на ваш Stripe, доля начисляется 1-го числа и выплачивается через Зарплаты, только если вы включили выплаты."
        actions={
          <>
            <Button variant="outline" onClick={() => setContractOpen(true)}>
              <FileText size={16} weight="light" />
              Договор
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} weight="light" />
              Добавить партнёра
            </Button>
          </>
        }
      />
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {rows.length === 0 && !list.isPending ? (
        <EmptyState
          icon={GlobeHemisphereWest}
          title="Партнёров стран пока нет"
          text="Добавьте партнёра: страна, процент, лимит сотрудников. США всегда остаются за вами."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Страна</Th>
              <Th>Партнёр</Th>
              <Th>Процент</Th>
              <Th>Команда</Th>
              <Th>Выплаты</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? <TableEmpty colSpan={6} loading /> : null}
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                <Td className="text-ink">
                  {r.countryName} <span className="text-xs text-faint">{r.countryCode}</span>
                </Td>
                <Td>
                  <div className="text-ink">{r.name}</div>
                  <div className="text-xs text-faint">{r.leadEmail}</div>
                </Td>
                <Td className="tabular-nums">{r.sharePercent}%</Td>
                <Td className="tabular-nums">
                  {r.teamSize} / {r.maxAdmins}
                </Td>
                <Td>
                  <Badge tone={r.payoutsEnabled ? 'success' : 'neutral'}>{r.payoutsEnabled ? 'включены' : 'выключены'}</Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={PARTNER_STATUS[r.status]?.tone ?? 'neutral'} dot>
                      {PARTNER_STATUS[r.status]?.label ?? r.status}
                    </Badge>
                    {r.contractAcceptedAt ? null : <Badge tone="warning">договор не принят</Badge>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(d) => {
          setCreating(false);
          void qc.invalidateQueries({ queryKey: ['country-partners'] });
          toast.success(`${d.name}: партнёр создан. Он входит в админку со своим логином и 2FA.`);
          setOpenId(d.id);
        }}
      />
      {openId ? <DetailDialog id={openId} onClose={() => setOpenId(null)} /> : null}
      <ContractDialog open={contractOpen} onClose={() => setContractOpen(false)} />
    </>
  );
}

/** Runs [fn]; on «needs 2FA» shows the code dialog and retries once. */
function useStepUp() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const run = (fn: () => Promise<unknown>, onError: (e: unknown) => void) => {
    fn().catch((e: unknown) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') {
        setPending(() => () => void fn().catch(onError));
      } else onError(e);
    });
  };
  const dialog = (
    <StepUpDialog
      open={pending !== null}
      description="Это меняет деньги партнёра. Подтвердите, что это вы."
      onCancel={() => setPending(null)}
      onDone={() => {
        const p = pending;
        setPending(null);
        p?.();
      }}
    />
  );
  return { run, dialog };
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (d: Detail) => void;
}) {
  const toast = useToast();
  const stepUp = useStepUp();
  const countries = useQuery({
    queryKey: ['countries'],
    enabled: open,
    queryFn: async () => (await api.GET('/admin/countries')).data!.data,
  });
  const [f, setF] = useState({
    countryCode: '',
    name: '',
    contact: '',
    email: '',
    login: '',
    password: '',
    sharePercent: '20',
    maxAdmins: '10',
    contractStartsAt: '',
    contractEndsAt: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const choices = (countries.data?.countries ?? []).filter((c) => c.code !== 'US');

  const submit = () => {
    const body: Create = {
      countryCode: f.countryCode,
      name: f.name.trim(),
      email: f.email.trim(),
      sharePercent: Number(f.sharePercent),
      maxAdmins: Number(f.maxAdmins),
      ...(f.contact.trim() ? { contact: f.contact.trim() } : {}),
      ...(f.login.trim() ? { login: f.login.trim() } : {}),
      ...(f.password ? { password: f.password } : {}),
      ...(dateToIso(f.contractStartsAt) ? { contractStartsAt: dateToIso(f.contractStartsAt)! } : {}),
      ...(dateToIso(f.contractEndsAt) ? { contractEndsAt: dateToIso(f.contractEndsAt)! } : {}),
      ...(f.note.trim() ? { note: f.note.trim() } : {}),
    };
    setBusy(true);
    stepUp.run(
      async () => {
        const r = await api.POST('/admin/country-partners', { body });
        setBusy(false);
        onCreated(r.data!.data);
      },
      (e) => {
        setBusy(false);
        toast.error(e);
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} eyebrow="Партнёр страны" title="Новый партнёр" wide>
      {stepUp.dialog}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Страна" hint="Одна страна на партнёра. США не передаются.">
          <Select required value={f.countryCode} onChange={set('countryCode')}>
            <option value="">Выберите…</option>
            {choices.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code}){c.isEnabled ? '' : ' — выключена'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Компания или имя (сторона договора)">
          <Input required minLength={2} maxLength={120} value={f.name} onChange={set('name')} />
        </Field>
        <Field label="E-mail для входа в админку">
          <Input required type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Контакт (телефон, мессенджер)">
          <Input maxLength={200} value={f.contact} onChange={set('contact')} />
        </Field>
        <Field label="Логин" hint="Можно задать позже в Администраторах.">
          <Input maxLength={40} autoComplete="off" value={f.login} onChange={set('login')} />
        </Field>
        <Field label="Пароль" hint="Передайте его партнёру лично; при входе он привяжет 2FA.">
          <Input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
        </Field>
        <Field label="Процент от чистого дохода страны">
          <Input required type="number" min={0.01} max={90} step={0.01} value={f.sharePercent} onChange={set('sharePercent')} />
        </Field>
        <Field label="Сколько сотрудников он может нанять">
          <Input required type="number" min={0} max={100} value={f.maxAdmins} onChange={set('maxAdmins')} />
        </Field>
        <Field label="Договор с">
          <Input type="date" value={f.contractStartsAt} onChange={set('contractStartsAt')} />
        </Field>
        <Field label="Договор до">
          <Input type="date" value={f.contractEndsAt} onChange={set('contractEndsAt')} />
        </Field>
        <Field label="Заметка (видите только вы)" className="sm:col-span-2">
          <Textarea maxLength={1000} value={f.note} onChange={set('note')} />
        </Field>
        <p className="text-xs text-muted sm:col-span-2">
          Выплаты партнёру сначала выключены. Включите их в карточке, когда договор подписан и Stripe-счёт партнёра
          подключён в Зарплатах.
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={busy}>
            Создать
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const stepUp = useStepUp();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [share, setShare] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['country-partner', id],
    queryFn: async () => (await api.GET('/admin/country-partners/{id}', { params: { path: { id } } })).data!.data,
  });
  const d = q.data;
  const done = (text: string) => (r: { data?: { data: Detail } }) => {
    if (r.data) qc.setQueryData(['country-partner', id], r.data.data);
    void qc.invalidateQueries({ queryKey: ['country-partners'] });
    toast.success(text);
  };
  const path = { params: { path: { id } } };

  const setStatus = async (status: 'active' | 'paused' | 'disabled') => {
    if (!d) return;
    const ok = await confirm(
      status === 'disabled'
        ? {
            title: `Отключить ${d.name}?`,
            description:
              'Партнёр и вся его команда сразу выходят из админки и не смогут войти. Выплаты останавливаются. Страна и её пользователи остаются у вас.',
            confirm: 'Отключить',
            danger: true,
          }
        : status === 'paused'
          ? {
              title: `Пауза выплат для ${d.name}?`,
              description: 'Команда продолжает работать, а начисления ждут, пока вы не снимете паузу.',
              confirm: 'Поставить паузу',
            }
          : { title: `Снова включить ${d.name}?`, description: 'Команда снова сможет войти.', confirm: 'Включить' },
    );
    if (!ok) return;
    stepUp.run(
      async () =>
        done(
          status === 'disabled' ? 'Партнёр отключён, команда вышла' : status === 'paused' ? 'Пауза выплат' : 'Партнёр снова работает',
        )(await api.PUT('/admin/country-partners/{id}/status', { ...path, body: { status } })),
      (e) => toast.error(e),
    );
  };
  const setPayouts = (enabled: boolean) =>
    stepUp.run(
      async () =>
        done(enabled ? 'Выплаты включены' : 'Выплаты выключены')(
          await api.PUT('/admin/country-partners/{id}/payouts', { ...path, body: { enabled } }),
        ),
      (e) => toast.error(e),
    );
  const saveShare = () => {
    const v = Number(share);
    if (!(v > 0 && v <= 90)) return;
    stepUp.run(
      async () => {
        done(`Процент: ${v}%`)(await api.PUT('/admin/country-partners/{id}/share', { ...path, body: { sharePercent: v } }));
        setShare(null);
      },
      (e) => toast.error(e),
    );
  };

  return (
    <Dialog open onClose={onClose} eyebrow="Партнёр страны" title={d ? `${d.name} · ${d.countryName}` : 'Загрузка…'} wide>
      {dialog}
      {stepUp.dialog}
      {q.error ? <ErrorNote text={errorText(q.error)} /> : null}
      {d ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PARTNER_STATUS[d.status]?.tone ?? 'neutral'} dot>
              {PARTNER_STATUS[d.status]?.label ?? d.status}
            </Badge>
            <Badge tone={d.contractAcceptedAt ? 'success' : 'warning'}>
              {d.contractAcceptedAt ? `договор v${d.contractVersion} принят ${formatDateTime(d.contractAcceptedAt)}` : 'договор ещё не принят'}
            </Badge>
            <span className="text-xs text-faint">вход: {d.leadEmail}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="text-xs text-muted">Процент</div>
              {share === null ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xl font-semibold text-heading tabular-nums">{d.sharePercent}%</span>
                  <Button size="sm" variant="outline" onClick={() => setShare(String(d.sharePercent))}>
                    Изменить
                  </Button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <Input type="number" min={0.01} max={90} step={0.01} className="h-8" value={share} onChange={(e) => setShare(e.target.value)} />
                  <Button size="sm" onClick={saveShare}>
                    OK
                  </Button>
                </div>
              )}
              <div className="mt-1 text-[11px] text-faint">с нового месяца, нужен код 2FA</div>
            </div>
            <div className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="text-xs text-muted">Выплаты</div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-sm text-ink">{d.payoutsEnabled ? 'включены' : 'выключены'}</span>
                <Switch checked={d.payoutsEnabled} onChange={(v: boolean) => setPayouts(v)} label="Выплаты партнёру" />
              </div>
              <div className="mt-1 text-[11px] text-faint">идут через Деньги → Зарплаты</div>
            </div>
            <div className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="text-xs text-muted">Команда</div>
              <div className="mt-1 text-xl font-semibold text-heading tabular-nums">
                {d.teamSize} / {d.maxAdmins}
              </div>
              <div className="mt-1 text-[11px] text-faint">сотрудников из лимита</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {d.status === 'active' ? (
              <Button size="sm" variant="outline" onClick={() => void setStatus('paused')}>
                Пауза выплат
              </Button>
            ) : null}
            {d.status !== 'active' ? (
              <Button size="sm" variant="outline" onClick={() => void setStatus('active')}>
                {d.status === 'paused' ? 'Снять паузу' : 'Включить снова'}
              </Button>
            ) : null}
            {d.status !== 'disabled' ? (
              <Button size="sm" variant="danger" onClick={() => void setStatus('disabled')}>
                Отключить партнёра
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Условия и цели
            </Button>
          </div>

          <SectionTitle>Этот месяц (ещё не начислено)</SectionTitle>
          <MonthLine rows={d.currentMonth} />

          <SectionTitle>Цели</SectionTitle>
          <Goals goals={d.goals} />

          <SectionTitle
            action={
              <Link href="/admins" className="text-xs text-gold-600 hover:underline">
                Открыть Администраторов
              </Link>
            }
          >
            Команда
          </SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Сотрудник</Th>
                <Th>Роль</Th>
                <Th>Вход</Th>
              </tr>
            </thead>
            <tbody>
              {d.team.length === 0 ? <TableEmpty colSpan={3}>Никого</TableEmpty> : null}
              {d.team.map((t) => (
                <tr key={t.id}>
                  <Td className="text-ink">
                    {t.email} {t.lead ? <Badge tone="gold">партнёр</Badge> : null}
                    {t.status !== 'active' ? <Badge tone="danger">отключён</Badge> : null}
                  </Td>
                  <Td>{ROLE_LABEL[t.role as AdminRole] ?? t.role}</Td>
                  <Td className="text-xs text-muted">{formatDateTime(t.lastLoginAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <SectionTitle>Начисления по месяцам</SectionTitle>
          <Settlements rows={d.settlements} />
          {d.note ? <p className="text-xs text-muted">Заметка: {d.note}</p> : null}
          {editing ? <EditDialog detail={d} onClose={() => setEditing(false)} onSaved={(x) => qc.setQueryData(['country-partner', id], x)} /> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function EditDialog({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: (d: Detail) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    name: detail.name,
    contact: detail.contact ?? '',
    maxAdmins: String(detail.maxAdmins),
    contractStartsAt: dateInput(detail.contractStartsAt),
    contractEndsAt: dateInput(detail.contractEndsAt),
    note: detail.note ?? '',
  });
  const [goals, setGoals] = useState<Goal[]>(detail.goals.map((g) => ({ metric: g.metric, target: g.target, deadline: g.deadline })));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PATCH('/admin/country-partners/{id}', {
          params: { path: { id: detail.id } },
          body: {
            name: f.name.trim(),
            contact: f.contact.trim() || null,
            maxAdmins: Number(f.maxAdmins),
            contractStartsAt: dateToIso(f.contractStartsAt),
            contractEndsAt: dateToIso(f.contractEndsAt),
            note: f.note.trim() || null,
            goals: goals.filter((g) => g.target > 0 && /^\d{4}-\d{2}-\d{2}$/.test(g.deadline)),
          },
        })
      ).data!.data,
    onSuccess: (d) => {
      onSaved(d);
      void qc.invalidateQueries({ queryKey: ['country-partners'] });
      toast.success('Сохранено');
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const setGoal = (i: number, patch: Partial<Goal>) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <Dialog open onClose={onClose} eyebrow={detail.name} title="Условия и цели" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Компания или имя">
          <Input value={f.name} maxLength={120} onChange={set('name')} />
        </Field>
        <Field label="Контакт">
          <Input value={f.contact} maxLength={200} onChange={set('contact')} />
        </Field>
        <Field label="Лимит сотрудников">
          <Input type="number" min={0} max={100} value={f.maxAdmins} onChange={set('maxAdmins')} />
        </Field>
        <div />
        <Field label="Договор с">
          <Input type="date" value={f.contractStartsAt} onChange={set('contractStartsAt')} />
        </Field>
        <Field label="Договор до">
          <Input type="date" value={f.contractEndsAt} onChange={set('contractEndsAt')} />
        </Field>
      </div>
      <SectionTitle
        action={
          goals.length < 10 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGoals((g) => [...g, { metric: 'attorneys', target: 50, deadline: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10) }])}
            >
              <Plus size={14} /> Цель
            </Button>
          ) : null
        }
      >
        Цели
      </SectionTitle>
      <div className="space-y-2">
        {goals.length === 0 ? <p className="text-sm text-muted">Если цель не выполнена к сроку, вам придёт письмо.</p> : null}
        {goals.map((g, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Field label="Что" className="min-w-44 flex-1">
              <Select value={g.metric} onChange={(e) => setGoal(i, { metric: e.target.value as Goal['metric'] })}>
                {Object.entries(GOAL_METRIC).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Сколько" className="w-32">
              <Input
                type="number"
                min={1}
                value={g.metric === 'revenue_cents' ? g.target / 100 : g.target}
                onChange={(e) => setGoal(i, { target: Math.round(Number(e.target.value) * (g.metric === 'revenue_cents' ? 100 : 1)) })}
              />
            </Field>
            <Field label="К дате" className="w-40">
              <Input type="date" value={g.deadline} onChange={(e) => setGoal(i, { deadline: e.target.value })} />
            </Field>
            <Button size="sm" variant="ghost" onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))}>
              Убрать
            </Button>
          </div>
        ))}
      </div>
      <Field label="Заметка (видите только вы)" className="mt-4">
        <Textarea maxLength={1000} value={f.note} onChange={set('note')} />
      </Field>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          <UsersThree size={16} weight="light" />
          Сохранить
        </Button>
      </div>
    </Dialog>
  );
}

function ContractDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['country-partner-contract'],
    enabled: open,
    queryFn: async () => (await api.GET('/admin/country-partners/contract')).data!.data,
  });
  const [text, setText] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () =>
      (await api.PUT('/admin/country-partners/contract', { body: { text: text ?? '' } })).data!.data,
    onSuccess: (c) => {
      qc.setQueryData(['country-partner-contract'], c);
      setText(null);
      toast.success(`Договор v${c.version} сохранён. Партнёры примут его при следующем входе.`);
    },
    onError: (e) => toast.error(e),
  });
  const value = text ?? q.data?.text ?? '';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow={q.data ? `Версия ${q.data.version}` : 'Договор'}
      title="Договор с партнёром страны"
      description="Шаблон, который партнёр принимает при первом входе. Покажите его юристу. Новая версия — каждый партнёр принимает её заново."
      wide
    >
      <Textarea className="min-h-80 font-mono text-xs" value={value} onChange={(e) => setText(e.target.value)} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
        <Button disabled={text === null || text.trim().length < 50} loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить новую версию
        </Button>
      </div>
    </Dialog>
  );
}
