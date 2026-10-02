'use client';

import { ArrowSquareOut, CalendarPlus, ChartLineUp, Clock, CrownSimple, Handshake, MagnifyingGlass, Warning, Wallet } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { GrantDialog, invalidateBilling, type PickedAttorney } from '@/components/billing/grant-dialog';
import { Kpi, KpiSkeletons } from '@/components/billing/kpi';
import { formatDate, LoadMore, type SubscriptionRow, UserCell, useBillingRole, userName } from '@/components/billing/shared';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { PAYMENT_STATUS, PLAN, StatusPill, SUBSCRIPTION_STATUS, usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Status = 'all' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'incomplete';
type Plan = '' | 'monthly' | 'yearly';
type GrantFilter = '' | 'yes' | 'no';

/** Subscriptions: KPIs, list by status / plan / search, details with extend and contract grant. */
export default function SubscriptionsPage() {
  const { canWrite, canOpenUsers, me } = useBillingRole();
  const [status, setStatus] = useState<Status>('all');
  const [plan, setPlan] = useState<Plan>('');
  const [grant, setGrant] = useState<GrantFilter>('');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<SubscriptionRow | null>(null);
  const [grantFor, setGrantFor] = useState<PickedAttorney | null>(null);

  const ov = useQuery({
    queryKey: ['billing-overview'],
    queryFn: async () => (await api.GET('/admin/billing/overview')).data!.data,
    enabled: !!me,
  });
  const list = useInfiniteQuery({
    queryKey: ['billing-subscriptions', status, plan, grant, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/billing/subscriptions', {
          params: {
            query: {
              cursor: pageParam,
              status: status === 'all' ? undefined : status,
              plan: plan || undefined,
              q: q || undefined,
              hasContractGrant: grant === '' ? undefined : grant === 'yes',
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const o = ov.data;

  return (
    <>
      <PageHeader
        eyebrow="Деньги"
        title="Подписки"
        subtitle="Тарифы адвокатов: $399 в месяц + $100 за место помощника или $9 590 в год с 6 местами. Клиенты пользуются бесплатно."
      />
      <ErrorNote text={ov.error ? errorText(ov.error) : null} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {o ? (
          <>
            <Kpi i={0} gold icon={Wallet} title="MRR" value={o.mrrCents} format={(n) => usd(n)} hint="активные и просроченные" />
            <Kpi i={1} icon={CrownSimple} title="Активные" value={o.subscriptions.active} hint={`месячных ${o.subscriptions.monthly} · годовых ${o.subscriptions.yearly}`} />
            <Kpi i={2} icon={Clock} title="Пробный период" value={o.subscriptions.trialing} />
            <Kpi i={3} warn icon={Warning} title="Просрочены" value={o.subscriptions.pastDue} hint="оплата не прошла" />
            <Kpi i={4} icon={Handshake} title="По договору" value={o.contractGrantsActive} hint="бесплатно" />
            <Kpi
              i={5}
              icon={ChartLineUp}
              title="Выручка за 30 дней"
              value={o.revenue30dCents}
              format={(n) => usd(n)}
              hint={o.refunds30dCents ? `возвраты ${usd(o.refunds30dCents)} (${o.refunds30dCount})` : 'за вычетом возвратов'}
            />
          </>
        ) : (
          <KpiSkeletons n={6} />
        )}
      </div>

      <div className="mt-7 mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all', label: 'Все' },
            { value: 'active', label: 'Активные', count: o?.subscriptions.active },
            { value: 'trialing', label: 'Пробные', count: o?.subscriptions.trialing },
            { value: 'past_due', label: 'Просрочены', count: o?.subscriptions.pastDue },
            { value: 'canceled', label: 'Отменены' },
            { value: 'expired', label: 'Истекли' },
            { value: 'incomplete', label: 'Не подтверждены' },
          ]}
        />
        <Select className="w-40" aria-label="Тариф" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
          <option value="">Все тарифы</option>
          <option value="monthly">Месячный</option>
          <option value="yearly">Годовой</option>
        </Select>
        <Select className="w-44" aria-label="Договор" value={grant} onChange={(e) => setGrant(e.target.value as GrantFilter)}>
          <option value="">С договором и без</option>
          <option value="yes">Есть договор</option>
          <option value="no">Без договора</option>
        </Select>
        <form
          className="relative min-w-60 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft.trim());
          }}
        >
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Имя или email — Enter" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </form>
      </div>

      <ErrorNote text={list.error ? errorText(list.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Адвокат</Th>
            <Th>Тариф</Th>
            <Th className="text-right">В месяц</Th>
            <Th>Статус</Th>
            <Th>До</Th>
            <Th>Договор</Th>
            <Th>Stripe</Th>
          </tr>
        </thead>
        <tbody>
          {list.isPending ? (
            <TableEmpty colSpan={7} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={7}>{q ? `Ничего не найдено по «${q}»` : 'Подписок с такими условиями нет'}</TableEmpty>
          ) : (
            rows.map((s) => (
              <tr key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                <Td>
                  <UserCell user={s.user} userId={s.userId} link={canOpenUsers} />
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="text-ink">{PLAN[s.plan] ?? s.plan}</div>
                  <div className="text-xs text-faint">
                    мест: {s.effectiveSeats}
                    {s.effectiveSeats !== s.assistantSeats ? ` (оплачено ${s.assistantSeats})` : ''}
                  </div>
                </Td>
                <Td className="text-right font-medium whitespace-nowrap tabular-nums">
                  {usd(s.monthlyEquivalentCents)}
                  {s.plan === 'yearly' ? <div className="text-xs font-normal text-faint">{usd(s.priceCents)} / год</div> : null}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusPill map={SUBSCRIPTION_STATUS} value={s.status} />
                    {s.cancelAtPeriodEnd ? <Badge tone="warning">отменится</Badge> : null}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-muted">
                  {s.status === 'trialing' ? (
                    <>
                      <div className="text-xs text-faint">пробный до</div>
                      {formatDate(s.trialEndsAt)}
                    </>
                  ) : (
                    formatDate(s.currentPeriodEnd)
                  )}
                </Td>
                <Td>
                  {s.contractGrant ? (
                    <Badge tone="gold">
                      <Handshake size={12} /> до {formatDate(s.contractGrant.endsAt)}
                    </Badge>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </Td>
                <Td>
                  {s.stripeSubscriptionId ? (
                    <span className="font-mono text-[11px] text-faint" title={s.stripeSubscriptionId}>
                      {s.stripeSubscriptionId.slice(0, 12)}…
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      <LoadMore q={list} />

      <SubscriptionDetails
        row={selected}
        canWrite={canWrite}
        onClose={() => setSelected(null)}
        onGrant={(a) => {
          setSelected(null);
          setGrantFor(a);
        }}
      />
      <GrantDialog open={!!grantFor} attorney={grantFor} onClose={() => setGrantFor(null)} />
    </>
  );
}

function SubscriptionDetails({
  row,
  canWrite,
  onClose,
  onGrant,
}: {
  row: SubscriptionRow | null;
  canWrite: boolean;
  onClose: () => void;
  onGrant: (a: PickedAttorney) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [days, setDays] = useState('7');
  const userId = row?.userId ?? '';
  const detail = useQuery({
    queryKey: ['admin-subscription', userId],
    enabled: !!row,
    queryFn: async () => (await api.GET('/admin/subscriptions/{userId}', { params: { path: { userId } } })).data!.data,
  });
  const extend = useMutation({
    mutationFn: async () => {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error('Укажите от 1 до 90 дней');
      const a = await ask({
        title: `Продлить подписку на ${n} дн.`,
        description: 'Например, компенсация по подтверждённой жалобе. Причина пишется в журнал аудита.',
        label: 'Причина',
        confirm: 'Продлить',
      });
      if (!a) return null;
      await api.POST('/admin/subscriptions/{userId}/extend', { params: { path: { userId } }, body: { days: n, reason: a.text } });
      return n;
    },
    onSuccess: (n) => {
      if (n == null) return;
      toast.success(`Подписка продлена на ${n} дн.`);
      invalidateBilling(qc, userId);
    },
    onError: (e) => toast.error(e instanceof Error && !('status' in e) ? e.message : e),
  });

  if (!row) return null;
  const canExtend =
    canWrite && !!row.stripeSubscriptionId && !['canceled', 'expired', 'incomplete'].includes(row.status);
  const d = detail.data;

  return (
    <>
      <Dialog open wide onClose={onClose} eyebrow="Подписка" title={userName(row.user, row.userId)} description={row.user?.email ?? undefined}>
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill map={SUBSCRIPTION_STATUS} value={row.status} />
            <Badge tone="neutral">{PLAN[row.plan] ?? row.plan}</Badge>
            {row.cancelAtPeriodEnd ? <Badge tone="warning">отменится в конце периода</Badge> : null}
            {row.isActive ? <Badge tone="success">доступ есть</Badge> : <Badge tone="danger">доступа нет</Badge>}
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
            <Item label="Цена">
              {usd(row.priceCents)} {row.plan === 'yearly' ? '/ год' : '/ мес'}
            </Item>
            <Item label="В пересчёте на месяц">{usd(row.monthlyEquivalentCents)}</Item>
            <Item label="Места помощников">
              {row.effectiveSeats}
              {row.effectiveSeats !== row.assistantSeats ? <span className="text-faint"> (оплачено {row.assistantSeats})</span> : null}
            </Item>
            <Item label="Пробный до">{formatDateTime(row.trialEndsAt)}</Item>
            <Item label="Период до">{formatDateTime(row.currentPeriodEnd)}</Item>
            <Item label="Льгота до">{formatDateTime(row.graceEndsAt)}</Item>
            <Item label="Создана">{formatDateTime(row.createdAt)}</Item>
            <Item label="Триалов на карте">{d ? d.trialsUsedWithCard : '…'}</Item>
            <Item label="Stripe">
              {d?.dashboardUrl ? (
                <a href={d.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-600 hover:underline">
                  открыть <ArrowSquareOut size={13} />
                </a>
              ) : row.stripeSubscriptionId ? (
                <span className="font-mono text-[11px] text-faint">{row.stripeSubscriptionId}</span>
              ) : (
                '—'
              )}
            </Item>
          </dl>

          {row.contractGrant ? (
            <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-gold-600">
              <Handshake size={18} weight="light" />
              По договору до {formatDate(row.contractGrant.endsAt)} · помощников {row.contractGrant.assistantSeats}
            </div>
          ) : null}

          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Последние платежи</h4>
            <ErrorNote text={detail.error ? errorText(detail.error) : null} />
            {!d ? (
              <div className="skeleton h-16 rounded-lg" />
            ) : d.payments.length === 0 ? (
              <p className="text-muted">Платежей нет</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.payments.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</span>
                    <span className="flex items-center gap-2">
                      {p.failureCode ? <span className="font-mono text-[11px] text-danger">{p.failureCode}</span> : null}
                      <span className="tabular-nums">{usd(p.amountCents, 2)}</span>
                      <StatusPill map={PAYMENT_STATUS} value={p.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canWrite ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              {canExtend ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    extend.mutate();
                  }}
                >
                  <Input type="number" min={1} max={90} className="h-9 w-20" aria-label="Дней" value={days} onChange={(e) => setDays(e.target.value)} />
                  <span className="text-xs text-muted">дн.</span>
                  <Button size="sm" variant="outline" type="submit" loading={extend.isPending} disabled={extend.isPending}>
                    <CalendarPlus size={15} /> Продлить
                  </Button>
                </form>
              ) : (
                <span className="text-xs text-faint">Продление доступно только для действующей подписки в Stripe.</span>
              )}
              <Button
                size="sm"
                variant="soft"
                onClick={() => onGrant({ id: row.userId, name: userName(row.user, row.userId), email: row.user?.email })}
              >
                <Handshake size={15} /> Выдать подписку по договору
              </Button>
            </div>
          ) : null}
        </div>
      </Dialog>
      {dialog}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
