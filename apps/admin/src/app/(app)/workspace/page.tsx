'use client';

import {
  ArrowRight, ChatCircleDots, Flag, Gavel, Medal, Scales, SealCheck, Trophy, Wallet, type Icon,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { NextTicketButton } from '@/components/support/support-nav';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { UpdatedAgo } from '@/components/updated-ago';
import { useNextVerification } from '@/components/workspace/queue-next';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { workspaceQuery } from '@/lib/live';
import { money } from '@/lib/payroll';
import { cn } from '@/lib/utils';

type Queue = components['schemas']['WorkspaceQueueDto'];

const ICON: Record<Queue['key'], Icon> = {
  verification: SealCheck,
  support: ChatCircleDots,
  moderation: Flag,
  review_appeals: Scales,
  cases: Gavel,
  payroll: Wallet,
  money: Wallet,
};

/**
 * «Рабочее место»: each employee sees only the queues their rights open,
 * how much is waiting and what is late, and starts working in one click.
 */
export default function WorkspacePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const ws = useQuery(workspaceQuery);
  const rewards = useQuery({
    queryKey: ['workspace-rewards'],
    queryFn: async () => (await api.GET('/admin/workspace/rewards')).data!.data,
    staleTime: 5 * 60_000,
  });
  const shift = useMutation({
    mutationFn: async (onShift: boolean) => (await api.PUT('/admin/support/agents/me', { body: { onShift } })).data!.data,
    onSuccess: (a) => {
      toast.success(a.onShift ? 'Смена начата: новые обращения будут приходить вам' : 'Смена закончена');
      void qc.invalidateQueries({ queryKey: ['workspace'] });
      void qc.invalidateQueries({ queryKey: ['support-agents'] });
    },
    onError: (e) => toast.error(e),
  });
  const nextVerification = useNextVerification();

  const queues = ws.data?.queues ?? [];
  const waiting = queues.reduce((n, q) => n + q.count, 0);
  const late = queues.reduce((n, q) => n + q.urgent, 0);
  const r = rewards.data;

  return (
    <>
      <PageHeader
        eyebrow="Дашборд"
        title="Рабочее место"
        subtitle={
          ws.data
            ? waiting === 0
              ? 'Всё сделано: в ваших очередях ничего не ждёт.'
              : `Ждёт: ${waiting}${late ? `, из них просрочено или срочно: ${late}` : ''}. Нажмите «Начать», и задачи будут открываться одна за другой.`
            : 'Ваши очереди по правам доступа.'
        }
        actions={ws.data ? <span className="text-xs text-muted"><UpdatedAgo at={ws.dataUpdatedAt} /></span> : undefined}
      />

      {ws.data?.shift ? (
        <Card className="mb-5 flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink">{ws.data.shift.onShift ? 'Вы на смене' : 'Вы не на смене'}</div>
            <div className="mt-0.5 text-xs text-muted">
              {ws.data.shift.onShift
                ? `Новые обращения приходят вам автоматически. Сейчас у вас ${ws.data.shift.openTickets} из ${ws.data.shift.maxOpen}.`
                : 'Включите смену, чтобы новые обращения приходили вам автоматически.'}
            </div>
          </div>
          <Switch
            checked={ws.data.shift.onShift}
            disabled={shift.isPending}
            label="Смена"
            onChange={(v) => shift.mutate(v)}
          />
        </Card>
      ) : null}

      <ErrorNote text={ws.error ? errorText(ws.error) : null} />
      {ws.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : queues.length === 0 ? (
        <EmptyState
          icon={SealCheck}
          title="Очередей нет"
          text="У вашей роли нет разделов с задачами. Владелец может дать права в разделе «Сотрудники»."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {queues.map((q, i) => {
            const I = ICON[q.key] ?? SealCheck;
            const start =
              q.focus && q.canAct && q.count > 0 ? (
                q.key === 'support' ? (
                  <NextTicketButton label="Начать" size="default" />
                ) : q.key === 'verification' ? (
                  <Button variant="gold" loading={nextVerification.isPending} onClick={() => nextVerification.mutate()}>
                    {nextVerification.isPending ? null : <ArrowRight size={15} weight="bold" />}
                    Начать
                  </Button>
                ) : null
              ) : null;
            return (
              <motion.div
                key={q.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <Card className={cn('flex h-full flex-col p-5', q.urgent > 0 && 'border-danger/40')}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-gold-600">
                      <I size={19} weight="light" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium break-words text-heading">{q.label}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {q.count} {q.unit}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="font-serif text-3xl font-semibold tabular-nums text-heading">{q.count}</span>
                    {q.urgent > 0 ? (
                      <Badge tone="danger" dot>
                        срочно: {q.urgent}
                      </Badge>
                    ) : null}
                    {!q.canAct ? <Badge tone="neutral">только просмотр</Badge> : null}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {start}
                    <Link
                      href={q.href}
                      className="inline-flex h-10 items-center gap-1.5 rounded-[12px] border border-line-strong bg-surface px-4 text-sm text-ink transition-colors hover:border-gold/60 hover:bg-surface-2"
                    >
                      Открыть список
                    </Link>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {r?.enabled ? (
        <div className="mt-8">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Trophy size={16} weight="light" className="text-gold-600" /> Лучший сотрудник
            </span>
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {r.ranks.map((k) => (
              <Card key={k.department} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-heading">{k.label}</span>
                  {k.prize ? <Badge tone="info">приз: {k.prize}</Badge> : null}
                </div>
                <div className="mt-3 text-sm text-ink">
                  {k.rank ? (
                    <>
                      Вы на <b>{k.rank}</b> месте из {k.of} · {k.score} очк.
                    </>
                  ) : (
                    'В этом периоде у вас пока нет очков.'
                  )}
                </div>
                {k.leaderName && k.rank !== 1 ? (
                  <div className="mt-1 text-xs text-muted">Сейчас первым идёт {k.leaderName}</div>
                ) : null}
              </Card>
            ))}
          </div>
          {r.awards.length > 0 ? (
            <Card className="mt-4 p-5">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Ваши награды</h3>
              <ul className="space-y-2">
                {r.awards.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Medal size={16} weight="fill" className="text-gold-600" />
                    <span className="text-ink">
                      {a.period} · {a.prize || 'Лучший сотрудник'}
                    </span>
                    {a.bonusCents > 0 ? <Badge tone="success">{money(a.bonusCents, a.currency)} к зарплате</Badge> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
