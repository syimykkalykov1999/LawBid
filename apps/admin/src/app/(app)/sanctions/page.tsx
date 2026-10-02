'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MoreButton } from '@/components/legacy/more-button';
import { useDebounced } from '@/components/legacy/use-debounced';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Badge, type Tone } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type Ban = components['schemas']['AdminBanDto'];
type Tab = 'active' | 'ended' | 'all';
type Kind = '' | 'user' | 'phone' | 'email' | 'device';

const KIND_RU: Record<string, string> = {
  user: 'Пользователь',
  phone: 'Телефон',
  email: 'E-mail',
  device: 'Устройство',
};
const KIND_HINT: Record<string, string> = {
  user: 'ID пользователя (из карточки в «Пользователях»)',
  phone: 'Номер в формате +15551234567',
  email: 'Адрес почты',
  device: 'ID устройства (виден в сессиях пользователя)',
};
const DURATIONS: { value: string; label: string }[] = [
  { value: '1', label: '1 день' },
  { value: '7', label: '7 дней' },
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: '365', label: '1 год' },
  { value: '', label: 'Бессрочно' },
];

/** Owner 2026-10-02: blocks and bans. Data is never deleted here. */
export default function SanctionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canManage = me.data ? can(me.data, 'sanctions', 'manage') : false;
  const { ask, dialog } = useReason();
  const [tab, setTab] = useState<Tab>('active');
  const [kind, setKind] = useState<Kind>('');
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 300);
  const [form, setForm] = useState<{ userId?: string } | null>(null);

  // Deep link from a user card: /sanctions?user=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('user');
    if (id) setForm({ userId: id });
  }, []);

  const list = useInfiniteQuery({
    queryKey: ['bans', tab, kind, search],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/sanctions/bans', {
          params: { query: { status: tab, kind: kind || undefined, q: search || undefined, cursor: pageParam } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['bans'] });

  const lift = useMutation({
    mutationFn: async (b: Ban) => {
      const a = await ask({
        title: 'Снять блокировку',
        description: `${KIND_RU[b.kind] ?? b.kind}: ${b.value}`,
        label: 'Причина снятия',
        min: 3,
        confirm: 'Снять',
      });
      if (!a) return false;
      await api.POST('/admin/sanctions/bans/{id}/lift', { params: { path: { id: b.id } }, body: { reason: a.text } });
      return true;
    },
    onSuccess: (ok) => {
      if (!ok) return;
      toast.success('Блокировка снята');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Санкции"
        subtitle="Блокировка пользователя на срок или навсегда, бан по номеру телефона, e-mail и устройству. Данные не удаляются: всё, что закон требует хранить, остаётся. Заблокированный видит в приложении «Аккаунт заблокирован, обратитесь в поддержку»."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'active', label: 'Действуют' },
            { value: 'ended', label: 'Закончились или сняты' },
            { value: 'all', label: 'Все' },
          ]}
        />
        <Select aria-label="Тип" className="w-44" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="">Тип: любой</option>
          {Object.entries(KIND_RU).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Поиск"
          className="w-64"
          placeholder="Телефон, e-mail, устройство, ID"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {canManage ? (
          <Button className="ml-auto" onClick={() => setForm({})}>
            Новая блокировка
          </Button>
        ) : null}
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Кого</Th>
            <Th>Причина</Th>
            <Th>Срок</Th>
            <Th>Создана</Th>
            <Th>Статус</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>Блокировок нет.</TableEmpty>
          ) : (
            rows.map((b) => {
              const state: { text: string; tone: Tone } = b.active
                ? { text: 'Действует', tone: 'danger' }
                : b.liftedAt
                  ? { text: 'Снята', tone: 'neutral' }
                  : { text: 'Срок вышел', tone: 'neutral' };
              return (
                <tr key={b.id}>
                  <Td>
                    <div className="text-xs text-faint">{KIND_RU[b.kind] ?? b.kind}</div>
                    <div className="break-all font-medium text-heading">{b.value}</div>
                    {b.userName ? <div className="text-xs text-muted">{b.userName}</div> : null}
                  </Td>
                  <Td className="max-w-xs text-sm text-ink">
                    {b.reason}
                    {b.liftReason ? <div className="text-xs text-muted">Снята: {b.liftReason}</div> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{b.expiresAt ? `до ${formatDateTime(b.expiresAt)}` : 'бессрочно'}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(b.createdAt)}</Td>
                  <Td>
                    <Badge tone={state.tone} dot>
                      {state.text}
                    </Badge>
                  </Td>
                  <Td>
                    {canManage && b.active ? (
                      <Button size="sm" variant="outline" loading={lift.isPending} onClick={() => lift.mutate(b)}>
                        Снять
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      <MoreButton show={list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
      {form ? (
        <BanDialog
          prefillUser={form.userId}
          onClose={() => setForm(null)}
          onDone={() => {
            refresh();
            setForm(null);
          }}
        />
      ) : null}
      {dialog}
    </>
  );
}

function BanDialog({
  prefillUser,
  onClose,
  onDone,
}: {
  prefillUser?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'user' | 'one'>(prefillUser ? 'user' : 'one');
  const [kind, setKind] = useState<'phone' | 'email' | 'device' | 'user'>('phone');
  const [value, setValue] = useState('');
  const [userId, setUserId] = useState(prefillUser ?? '');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [banPhone, setBanPhone] = useState(false);
  const [banEmail, setBanEmail] = useState(false);
  const [banDevices, setBanDevices] = useState(false);
  const d = days ? Number(days) : undefined;

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'user') {
        await api.POST('/admin/sanctions/users/{id}/block', {
          params: { path: { id: userId.trim() } },
          body: { reason: reason.trim(), days: d, banPhone, banEmail, banDevices },
        });
      } else {
        await api.POST('/admin/sanctions/bans', {
          body: { kind, value: value.trim(), reason: reason.trim(), days: d },
        });
      }
    },
    onSuccess: () => {
      toast.success('Блокировка создана, сессии завершены');
      onDone();
    },
    onError: (e) => toast.error(e),
  });
  const ok = reason.trim().length >= 5 && (mode === 'user' ? userId.trim().length >= 30 : value.trim().length >= 3);

  return (
    <Dialog open onClose={onClose} wide title="Новая блокировка" description="Действует сразу; снять её можно в списке.">
      <div className="space-y-4">
        <Tabs<'user' | 'one'>
          value={mode}
          onChange={setMode}
          items={[
            { value: 'user', label: 'Заблокировать человека' },
            { value: 'one', label: 'Забанить телефон, e-mail или устройство' },
          ]}
        />
        {mode === 'user' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="b-user">ID пользователя</Label>
              <Input id="b-user" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={KIND_HINT.user} />
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-heading">Заодно забанить</div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={banPhone} onChange={(e) => setBanPhone(e.target.checked)} /> его номер телефона
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={banEmail} onChange={(e) => setBanEmail(e.target.checked)} /> его e-mail
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={banDevices} onChange={(e) => setBanDevices(e.target.checked)} /> все его устройства
              </label>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-3">
            <div className="w-44 space-y-1.5">
              <Label htmlFor="b-kind">Что банить</Label>
              <Select id="b-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="phone">Телефон</option>
                <option value="email">E-mail</option>
                <option value="device">Устройство</option>
                <option value="user">Пользователя (ID)</option>
              </Select>
            </div>
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="b-value">Значение</Label>
              <Input id="b-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={KIND_HINT[kind]} />
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <div className="w-44 space-y-1.5">
            <Label htmlFor="b-days">Срок</Label>
            <Select id="b-days" value={days} onChange={(e) => setDays(e.target.value)}>
              {DURATIONS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="b-reason">Причина (не короче 5 символов)</Label>
            <Input id="b-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" variant="danger" disabled={!ok} loading={save.isPending} onClick={() => save.mutate()}>
            Заблокировать
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
