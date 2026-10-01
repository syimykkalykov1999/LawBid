'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime, formatDuration } from '@/lib/utils';

/** docs/06 §2.3 item 1. */
export default function DashboardPage() {
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.GET('/admin/dashboard')).data!.data,
    refetchInterval: 60_000,
  });
  const d = q.data;
  // Owner 2026-09-30: plans, assistants, tasks, chats and calls.
  const o = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => (await api.GET('/admin/overview')).data!.data,
    refetchInterval: 60_000,
  }).data;
  const usd = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <>
      <PageHeader
        title="Дашборд"
        subtitle={d ? `Данные на ${formatDateTime(d.computedAt)}` : undefined}
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            title="Новые клиенты за 24 ч"
            value={d.newUsers.clients24h}
            hint={`за 7 дней: ${d.newUsers.clients7d}`}
          />
          <Stat
            title="Новые адвокаты за 24 ч"
            value={d.newUsers.attorneys24h}
            hint={`за 7 дней: ${d.newUsers.attorneys7d}`}
          />
          <Stat
            title="Очередь верификации"
            value={d.verification.queueSize}
            hint={`самая старая: ${formatDuration(d.verification.oldestAgeSeconds)}`}
          />
          <Stat
            title="Активные подписки"
            value={d.subscriptions.active}
            hint={`триал ${d.subscriptions.trialing} · просрочено ${d.subscriptions.pastDue}`}
          />
          <Stat
            title="Оценка выручки / мес"
            value={usd(d.subscriptions.revenueEstimateUsd)}
            hint="active × $399"
          />
          <Stat title="Открытые кейсы" value={d.openCases} />
          <Stat title="Биды за сутки" value={d.bids24h} />
          <Stat
            title="Требуют внимания"
            value={d.openReports + d.openDisputes + d.openContactIssues}
            hint={`жалобы ${d.openReports} · споры ${d.openDisputes} · «не могу связаться» ${d.openContactIssues}`}
          />
        </div>
      ) : null}
      {o ? (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
            Пользователи, планы и команды
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat title="Клиенты" value={o.clients} />
            <Stat title="Адвокаты" value={o.attorneys} hint={`верифицировано: ${o.attorneysVerified}`} />
            <Stat
              title="Подписки"
              value={o.subscriptionsMonthly + o.subscriptionsYearly}
              hint={`месячных ${o.subscriptionsMonthly} · годовых ${o.subscriptionsYearly}`}
            />
            <Stat title="Выручка за 30 дней" value={usd(o.revenue30dCents / 100)} />
            <Stat title="Помощники работают" value={o.assistants} hint={`мест оплачено: ${o.assistantSeats}`} />
            <Stat title="Открытые задачи" value={o.tasksOpen} hint={`выполнено за 30 дней: ${o.tasksDone30d}`} />
            <Stat title="Ждут одобрения адвоката" value={o.requestsPending} />
          </div>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
            Активность за 7 дней
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat title="Новые кейсы" value={o.cases7d} />
            <Stat title="Ставки" value={o.bids7d} />
            <Stat title="Публикации" value={o.posts7d} />
            <Stat title="Сообщения в чатах" value={o.messages7d} />
            <Stat title="Звонки" value={o.calls7d} hint={`пропущено: ${o.callsMissed7d}`} />
          </div>
        </>
      ) : null}
      {d ? null : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-28 animate-pulse" />
          ))}
        </div>
      )}
    </>
  );
}

function Stat({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold text-navy">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
