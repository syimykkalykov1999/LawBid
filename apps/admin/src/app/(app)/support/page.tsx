'use client';

import {
  ArrowClockwise, ChatCircleDots, CheckCircle, HourglassMedium, Lifebuoy, MagnifyingGlass, Siren, Timer, UserCircleDashed,
} from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { KpiChip } from '@/components/support/kpi-chip';
import { NextTicketButton, SupportNav } from '@/components/support/support-nav';
import {
  CATEGORIES, minutesText, PRIORITIES, type TicketCategory, type TicketPriority, type TicketStatus,
} from '@/components/support/support-labels';
import { TicketRowItem } from '@/components/support/ticket-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Input, Select } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { UpdatedAgo } from '@/components/updated-ago';
import { api, errorText } from '@/lib/api/client';
import { PRIORITY, TICKET_CATEGORY } from '@/lib/labels';
import { livePoll, supportStatsQuery } from '@/lib/live';
import { cn } from '@/lib/utils';

type StatusTab = 'all' | TicketStatus;
type AssigneeTab = 'all' | 'me' | 'unassigned';
type SlaFilter = '' | 'breached';

/** Support inbox — user tickets, latest activity first, refreshed every minute. */
export default function SupportInboxPage() {
  const [status, setStatus] = useState<StatusTab>('open');
  const [assignee, setAssignee] = useState<AssigneeTab>('all');
  const [category, setCategory] = useState<'' | TicketCategory>('');
  const [priority, setPriority] = useState<'' | TicketPriority>('');
  const [draftQ, setDraftQ] = useState('');
  const [q, setQ] = useState('');
  const [sla, setSla] = useState<SlaFilter>('');

  // Polled by the sidebar badge (lib/live.ts); this page reads the cache.
  const stats = useQuery(supportStatsQuery);
  const filters = { status, assignee, category, priority, q, sla };
  const list = useInfiniteQuery({
    queryKey: ['support-tickets', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/support/tickets', {
          params: {
            query: {
              cursor: pageParam,
              status: status === 'all' ? undefined : status,
              assignee: assignee === 'all' ? undefined : assignee,
              category: category || undefined,
              priority: priority || undefined,
              q: q || undefined,
              sla: sla || undefined,
            },
          },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
    // Every loaded page is one request per refresh: keep it to a minute.
    refetchInterval: livePoll(),
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const s = stats.data;
  const filtered = assignee !== 'all' || category || priority || q || sla;

  return (
    <>
      <PageHeader
        eyebrow="Связь"
        title="Поддержка"
        subtitle={
          s?.openNow === false
            ? <>Сейчас нерабочее время: пользователи получают автоответ. Список обновляется раз в минуту, <UpdatedAgo at={list.dataUpdatedAt} />.</>
            : <>Обращения пользователей из приложения. Список обновляется раз в минуту, <UpdatedAgo at={list.dataUpdatedAt} />.</>
        }
        actions={
          <div className="flex flex-wrap gap-2">
          <NextTicketButton />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void list.refetch();
              void stats.refetch();
            }}
            loading={list.isRefetching && !list.isFetchingNextPage}
          >
            {list.isRefetching ? null : <ArrowClockwise size={15} weight="light" />}
            Обновить
          </Button>
          </div>
        }
      />
      <SupportNav />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {s ? (
          <>
            <KpiChip i={0} icon={ChatCircleDots} label="Открыто" value={s.byStatus.open} accent={s.byStatus.open > 0} onClick={() => setStatus('open')} />
            <KpiChip i={1} icon={HourglassMedium} label="Ждём пользователя" value={s.byStatus.waiting_user} onClick={() => setStatus('waiting_user')} />
            <KpiChip i={2} icon={CheckCircle} label="Решено" value={s.byStatus.resolved} onClick={() => setStatus('resolved')} />
            <KpiChip
              i={3}
              icon={UserCircleDashed}
              label="Без ответственного"
              value={s.openUnassigned}
              accent={s.openUnassigned > 0}
              onClick={() => {
                setStatus('open');
                setAssignee('unassigned');
              }}
            />
            <KpiChip
              i={4}
              icon={Siren}
              label="Просрочено"
              value={s.slaBreached ?? 0}
              accent={(s.slaBreached ?? 0) > 0}
              onClick={() => {
                setStatus('open');
                setSla('breached');
              }}
            />
            <KpiChip i={5} icon={Timer} label="Первый ответ, 30 дн." text={minutesText(s.avgFirstResponseMinutes30d)} />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[66px] rounded-[var(--radius-lg)]" />)
        )}
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs<StatusTab>
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all', label: 'Все' },
            { value: 'open', label: 'Открытые', count: s?.byStatus.open },
            { value: 'waiting_user', label: 'Ждём пользователя', count: s?.byStatus.waiting_user },
            { value: 'resolved', label: 'Решённые', count: s?.byStatus.resolved },
            { value: 'closed', label: 'Закрытые', count: s?.byStatus.closed },
          ]}
        />
        <Tabs<AssigneeTab>
          size="sm"
          value={assignee}
          onChange={setAssignee}
          items={[
            { value: 'me', label: 'Мои' },
            { value: 'unassigned', label: 'Без ответственного' },
            { value: 'all', label: 'Все' },
          ]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draftQ.trim());
          }}
        >
          <MagnifyingGlass size={16} weight="light" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Поиск по теме — Enter"
            className="pl-9"
            aria-label="Поиск по теме"
          />
        </form>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as '' | TicketCategory)}
          className="w-48"
          aria-label="Категория"
        >
          <option value="">Все категории</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TICKET_CATEGORY[c]}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value as '' | TicketPriority)}
          className="w-44"
          aria-label="Приоритет"
        >
          <option value="">Любой приоритет</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY[p]}
            </option>
          ))}
        </Select>
        <Button
          variant={sla ? 'soft' : 'outline'}
          size="sm"
          aria-pressed={!!sla}
          onClick={() => setSla(sla ? '' : 'breached')}
        >
          <Siren size={15} weight="light" /> Просроченные
        </Button>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAssignee('all');
              setCategory('');
              setPriority('');
              setDraftQ('');
              setQ('');
              setSla('');
            }}
          >
            Сбросить
          </Button>
        ) : null}
      </div>

      <ErrorNote text={list.error ? errorText(list.error) : null} />

      <Card className="mt-4 overflow-hidden">
        {list.isPending ? (
          <ul className="divide-y divide-line">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3.5 px-5 py-3.5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-5 w-24" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-4 border-none"
            icon={Lifebuoy}
            title={filtered ? 'Ничего не нашлось' : 'Обращений нет'}
            text={filtered ? 'Измените фильтры или поиск.' : 'Когда пользователи напишут в поддержку, обращения появятся здесь.'}
          />
        ) : (
          <ul className={cn('divide-y divide-line transition-opacity', list.isFetching && !list.isFetchingNextPage && 'opacity-90')}>
            {rows.map((t, i) => (
              <TicketRowItem key={t.id} t={t} i={i} showStatus={status === 'all'} />
            ))}
          </ul>
        )}
      </Card>
      {list.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      ) : null}
    </>
  );
}
