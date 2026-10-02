'use client';

import { ArrowSquareOut, CalendarPlus, Handshake } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { GrantDialog, invalidateBilling } from '@/components/billing/grant-dialog';
import { daysLeft, elapsed, formatDate, ProgressBar, useBillingRole } from '@/components/billing/shared';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { PAYMENT_STATUS, PLAN, StatusPill, SUBSCRIPTION_STATUS, usd } from '@/lib/labels';
import { Reason } from '@/lib/reasons';
import { formatDateTime } from '@/lib/utils';

/** docs/06 §1.6 / §2.2: support views; finance and super_admin extend and grant by contract. */
export function SubscriptionCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { canWrite } = useBillingRole();
  const { ask, dialog } = useReason();
  const [days, setDays] = useState('7');
  const [granting, setGranting] = useState(false);
  const q = useQuery({
    queryKey: ['admin-subscription', userId],
    queryFn: async () => (await api.GET('/admin/subscriptions/{userId}', { params: { path: { userId } } })).data!.data,
  });
  const grants = useQuery({
    queryKey: ['user-contract-grants', userId],
    queryFn: async () =>
      (await api.GET('/admin/billing/contract-grants/users/{userId}', { params: { path: { userId } } })).data!.data,
  });
  const extend = useMutation({
    mutationFn: async () => {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error('Укажите от 1 до 90 дней');
      const a = await ask({
        title: `Продлить подписку на ${n} дн.`,
        description: 'Компенсация (например, подтверждённая жалоба на контакт). Причина обязательна и пишется в аудит.',
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

  const d = q.data;
  const s = d?.subscription;
  const grant = grants.data?.find((g) => g.status === 'active') ?? null;
  const scheduled = grants.data?.find((g) => g.status === 'scheduled') ?? null;
  const canExtend = canWrite && !!s && !!d?.stripeSubscriptionId && !['incomplete', 'canceled', 'expired'].includes(s.status);

  return (
    <Card>
      {dialog}
      <CardHeader>
        <CardTitle>Подписка и платежи</CardTitle>
        {canWrite && !grant ? (
          <Button size="sm" variant="soft" onClick={() => setGranting(true)}>
            <Handshake size={14} /> Выдать по договору
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ErrorNote text={q.error ? errorText(q.error) : grants.error ? errorText(grants.error) : null} />

        {grant ? (
          <div className="rounded-xl bg-accent-soft px-3.5 py-3 text-gold-600">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <Handshake size={16} weight="light" /> По договору до {formatDate(grant.endsAt)}
              </span>
              <span className="text-xs">ещё {daysLeft(grant.endsAt)} дн.</span>
            </div>
            <ProgressBar className="mt-2" value={elapsed(grant.startsAt, grant.endsAt)} />
            <div className="mt-1.5 text-xs">
              помощников: {grant.assistantSeats}
              {grant.contractRef ? ` · ${grant.contractRef}` : ''}
            </div>
          </div>
        ) : scheduled ? (
          <div className="rounded-xl bg-info-soft px-3.5 py-2.5 text-xs text-info">
            По договору с {formatDate(scheduled.startsAt)} до {formatDate(scheduled.endsAt)} · помощников {scheduled.assistantSeats}
          </div>
        ) : null}

        {!d ? (
          q.isPending ? <div className="skeleton h-20 rounded-lg" /> : null
        ) : !s ? (
          <p className="text-muted">Платной подписки нет</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill map={SUBSCRIPTION_STATUS} value={s.status} />
              <Badge tone="neutral">{PLAN[s.plan] ?? s.plan}</Badge>
              {s.cancelAtPeriodEnd ? <Badge tone="warning">отмена в конце периода</Badge> : null}
              <span className="text-muted">
                {usd(s.priceCents)} {s.plan === 'yearly' ? '/ год' : '/ мес'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted">Места помощников</span>
              <span>{s.assistantSeats}</span>
              <span className="text-muted">Пробный до</span>
              <span>{formatDateTime(s.trialEndsAt)}</span>
              <span className="text-muted">Период до</span>
              <span>{formatDateTime(s.currentPeriodEnd)}</span>
              <span className="text-muted">Льгота до</span>
              <span>{formatDateTime(s.graceEndsAt)}</span>
              <span className="text-muted">Триалов на карте</span>
              <span>{d.trialsUsedWithCard}</span>
            </div>
            {d.dashboardUrl ? (
              <a className="inline-flex items-center gap-1 text-xs text-gold-600 hover:underline" href={d.dashboardUrl} target="_blank" rel="noreferrer">
                Открыть в Stripe <ArrowSquareOut size={12} />
              </a>
            ) : d.stripeSubscriptionId ? (
              <div className="font-mono text-[10px] text-muted">{d.stripeSubscriptionId}</div>
            ) : null}
            {canExtend ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  extend.mutate();
                }}
              >
                <Input type="number" min={1} max={90} aria-label="Дней" className="h-8 w-20" value={days} onChange={(e) => setDays(e.target.value)} />
                <span className="text-xs text-muted">дн.</span>
                <Button size="sm" variant="outline" type="submit" loading={extend.isPending} disabled={extend.isPending}>
                  <CalendarPlus size={14} /> Продлить
                </Button>
              </form>
            ) : null}
          </>
        )}

        {d && d.payments.length > 0 ? (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Платежи</h4>
            <ul className="space-y-1.5 text-xs">
              {d.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</span>
                  <span className="flex items-center gap-2">
                    {p.failureCode ? <Reason code={p.failureCode} className="text-[10px] text-danger" /> : null}
                    <span className="tabular-nums">{usd(p.amountCents, 2)}</span>
                    <StatusPill map={PAYMENT_STATUS} value={p.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      <GrantDialog open={granting} attorney={{ id: userId, name: null }} onClose={() => setGranting(false)} />
    </Card>
  );
}
