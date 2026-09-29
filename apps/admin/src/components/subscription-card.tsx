'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote } from '@/components/page-header';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

const STATUS: Record<string, string> = {
  incomplete: 'не подтверждена',
  trialing: 'триал',
  active: 'активна',
  past_due: 'просрочена',
  canceled: 'отменена',
  expired: 'истекла',
};

/** docs/06 §1.6 / §2.2: support views, finance and super_admin extend. */
export function SubscriptionCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { ask, dialog } = useReason();
  const [days, setDays] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['admin-subscription', userId],
    queryFn: async () =>
      (await api.GET('/admin/subscriptions/{userId}', { params: { path: { userId } } })).data!.data,
  });
  const extend = useMutation({
    mutationFn: async () => {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error('1–90 дней');
      const a = await ask({
        title: `Продлить подписку на ${n} дн.`,
        description: 'Компенсация (например, подтверждённая жалоба на контакт). Причина обязательна и пишется в аудит.',
        label: 'Причина',
        confirm: 'Продлить',
      });
      if (!a) return null;
      return api.POST('/admin/subscriptions/{userId}/extend', {
        params: { path: { userId } },
        body: { days: n, reason: a.text },
      });
    },
    onSuccess: (r) => {
      if (!r) return;
      setError(null);
      void qc.invalidateQueries({ queryKey: ['admin-subscription', userId] });
    },
    onError: (e) => setError(e instanceof Error && !('status' in e) ? e.message : errorText(e)),
  });
  const d = q.data;
  const canExtend = me?.role === 'super_admin' || me?.role === 'finance';

  return (
    <Card>
      {dialog}
      <CardHeader>
        <CardTitle>Подписка и платежи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ErrorNote text={error ?? (q.error ? errorText(q.error) : null)} />
        {!d ? null : !d.subscription ? (
          <p className="text-muted">Подписки нет</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={d.subscription.isActive ? 'success' : 'danger'}>
                {STATUS[d.subscription.status] ?? d.subscription.status}
              </Badge>
              {d.subscription.cancelAtPeriodEnd ? <Badge tone="gold">отмена в конце периода</Badge> : null}
              <span className="text-muted">${(d.subscription.priceCents / 100).toFixed(0)} / мес</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted">Триал до</span>
              <span>{formatDateTime(d.subscription.trialEndsAt)}</span>
              <span className="text-muted">Период до</span>
              <span>{formatDateTime(d.subscription.currentPeriodEnd)}</span>
              <span className="text-muted">Льгота до</span>
              <span>{formatDateTime(d.subscription.graceEndsAt)}</span>
              <span className="text-muted">Триалов на карте</span>
              <span>{d.trialsUsedWithCard}</span>
            </div>
            {d.dashboardUrl ? (
              <a className="text-xs text-navy underline" href={d.dashboardUrl} target="_blank" rel="noreferrer">
                Открыть в Stripe Dashboard
              </a>
            ) : (
              <div className="font-mono text-[10px] text-muted">{d.stripeSubscriptionId}</div>
            )}
            {canExtend && d.subscription.status !== 'canceled' && d.subscription.status !== 'expired' ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  extend.mutate();
                }}
              >
                <Input type="number" min={1} max={90} className="h-8 w-20" value={days} onChange={(e) => setDays(e.target.value)} />
                <span className="text-xs text-muted">дн.</span>
                <Button size="sm" variant="outline" type="submit" disabled={extend.isPending}>
                  Продлить
                </Button>
              </form>
            ) : null}
          </>
        )}
        {d && d.payments.length > 0 ? (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Платежи</h4>
            <ul className="space-y-1 text-xs">
              {d.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{formatDateTime(p.paidAt ?? p.createdAt)}</span>
                  <span>
                    ${(p.amountCents / 100).toFixed(2)} ·{' '}
                    <Badge tone={p.status === 'succeeded' ? 'success' : p.status === 'failed' ? 'danger' : 'neutral'}>{p.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
