'use client';

import { CalendarPlus, Handshake, Plus, Prohibit } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { GrantDialog, invalidateBilling } from '@/components/billing/grant-dialog';
import {
  type ContractGrant,
  CONTRACT_STATUS,
  CONTRACT_TONE,
  daysLeft,
  elapsed,
  formatDate,
  LoadMore,
  monthsText,
  ProgressBar,
  Stepper,
  TonePill,
  UserCell,
  useBillingRole,
  userName,
} from '@/components/billing/shared';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Field } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

type Status = 'active' | 'scheduled' | 'expired' | 'revoked';

/** Free contract subscriptions for blogger attorneys. */
export default function ContractsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const { canWrite, canOpenUsers } = useBillingRole();
  const [status, setStatus] = useState<Status>('active');
  const [creating, setCreating] = useState(false);
  const [extending, setExtending] = useState<ContractGrant | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['contract-grants', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await api.GET('/admin/billing/contract-grants', { params: { query: { status, cursor: pageParam } } })).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  const revoke = useMutation({
    mutationFn: async (g: ContractGrant) => {
      const a = await ask({
        title: 'Отозвать подписку по договору',
        description: `${userName(g.user, g.userId)} потеряет бесплатный доступ и места помощников сразу. Адвокат получит уведомление.`,
        label: 'Причина',
        confirm: 'Отозвать',
        danger: true,
      });
      if (!a) return null;
      await api.POST('/admin/billing/contract-grants/{id}/revoke', { params: { path: { id: g.id } }, body: { reason: a.text } });
      return g;
    },
    onSuccess: (g) => {
      if (!g) return;
      toast.success('Подписка по договору отозвана');
      invalidateBilling(qc, g.userId);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Подписки по договору"
        subtitle="Бесплатный доступ для адвокатов-блогеров на 3–12 месяцев по договору: все платные функции и до 6 мест для помощников, без оплаты в Stripe. Когда срок закончится, доступ пропадёт сам."
        actions={
          canWrite ? (
            <Button variant="gold" onClick={() => setCreating(true)}>
              <Plus size={16} /> Новая подписка по договору
            </Button>
          ) : null
        }
      />
      <div className="mb-4">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: 'active', label: 'Действуют' },
            { value: 'scheduled', label: 'Запланированы' },
            { value: 'expired', label: 'Закончились' },
            { value: 'revoked', label: 'Отозваны' },
          ]}
        />
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={status === 'active' ? 'Сейчас нет подписок по договору' : 'Здесь пусто'}
          text="Выдайте бесплатную подписку адвокату, с которым подписан договор о продвижении."
          action={
            canWrite && status === 'active' ? (
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus size={16} /> Новая подписка
              </Button>
            ) : null
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Адвокат</Th>
              <Th>Срок</Th>
              <Th>Помощники</Th>
              <Th className="min-w-56">Период</Th>
              <Th>Договор</Th>
              <Th>Выдал</Th>
              {canWrite ? <Th className="text-right">Действия</Th> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={canWrite ? 7 : 6} loading />
            ) : (
              rows.map((g) => {
                const share = elapsed(g.startsAt, g.endsAt);
                const live = g.status === 'active' || g.status === 'scheduled';
                return (
                  <tr key={g.id}>
                    <Td>
                      <UserCell user={g.user} userId={g.userId} link={canOpenUsers} />
                      <div className="mt-1">
                        <TonePill map={CONTRACT_STATUS} tones={CONTRACT_TONE} value={g.status} />
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{monthsText(g.months)}</Td>
                    <Td className="tabular-nums">{g.assistantSeats}</Td>
                    <Td>
                      <div className="flex items-center justify-between gap-2 text-xs whitespace-nowrap text-muted">
                        <span>
                          {formatDate(g.startsAt)} → {formatDate(g.endsAt)}
                        </span>
                        {g.status === 'active' ? <span className="text-faint">ещё {daysLeft(g.endsAt)} дн.</span> : null}
                      </div>
                      <ProgressBar
                        className="mt-1.5"
                        value={g.status === 'revoked' ? elapsed(g.startsAt, g.endsAt, new Date(g.revokedAt ?? g.endsAt).getTime()) : share}
                        tone={g.status === 'revoked' ? 'danger' : g.status === 'active' ? (share > 0.85 ? 'warning' : 'gold') : 'muted'}
                      />
                      {g.status === 'revoked' && g.revokeReason ? (
                        <div className="mt-1 text-xs text-danger">
                          Отозвана {formatDateTime(g.revokedAt)}: {g.revokeReason}
                        </div>
                      ) : null}
                    </Td>
                    <Td className="max-w-64">
                      {g.contractRef ? <div className="font-medium text-ink">{g.contractRef}</div> : null}
                      {g.note ? <div className="line-clamp-2 text-xs text-muted">{g.note}</div> : null}
                      {!g.contractRef && !g.note ? <span className="text-faint">—</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted">
                      <div className="font-mono text-faint" title={g.createdBy}>
                        {g.createdBy.slice(0, 8)}
                      </div>
                      {formatDateTime(g.createdAt)}
                    </Td>
                    {canWrite ? (
                      <Td className="text-right whitespace-nowrap">
                        {live ? (
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setExtending(g)}>
                              <CalendarPlus size={14} /> Продлить
                            </Button>
                            <Button size="sm" variant="danger-soft" disabled={revoke.isPending} onClick={() => revoke.mutate(g)}>
                              <Prohibit size={14} /> Отозвать
                            </Button>
                          </div>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
      {dialog}
      <GrantDialog open={creating} onClose={() => setCreating(false)} />
      <ExtendDialog grant={extending} onClose={() => setExtending(null)} />
    </>
  );
}

function ExtendDialog({ grant, onClose }: { grant: ContractGrant | null; onClose: () => void }) {
  return grant ? <ExtendForm grant={grant} onClose={onClose} /> : null;
}

function ExtendForm({ grant, onClose }: { grant: ContractGrant; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const maxAdd = Math.max(0, 24 - grant.months);
  const [months, setMonths] = useState(Math.min(3, maxAdd));
  const newEnd = (() => {
    const d = new Date(grant.endsAt);
    d.setMonth(d.getMonth() + months);
    return formatDate(d.toISOString());
  })();
  const extend = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/billing/contract-grants/{id}/extend', { params: { path: { id: grant.id } }, body: { months } })).data!.data,
    onSuccess: (g) => {
      toast.success(`Продлено до ${formatDate(g.endsAt)}`);
      invalidateBilling(qc, g.userId);
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="По договору"
      title="Продлить подписку"
      description={`${userName(grant.user, grant.userId)} · сейчас до ${formatDate(grant.endsAt)}. Всего не больше 24 месяцев.`}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (months > 0) extend.mutate();
        }}
      >
        {maxAdd === 0 ? (
          <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">Достигнут предел 24 месяца — продлить нельзя.</p>
        ) : (
          <Field label="Добавить месяцев" hint={`Новая дата окончания: ${newEnd}`}>
            <Stepper value={months} min={1} max={maxAdd} onChange={setMonths} label="Месяцев" />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={extend.isPending} disabled={months < 1 || extend.isPending}>
            Продлить на {monthsText(months)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
