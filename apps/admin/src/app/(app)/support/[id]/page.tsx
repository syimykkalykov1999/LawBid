'use client';

import { ArrowLeft, ChatsCircle, Eye, LockSimple } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ErrorNote } from '@/components/page-header';
import { Composer, type ComposerSubmit } from '@/components/support/composer';
import { MessageBubble } from '@/components/support/message-bubble';
import {
  canWriteSupport, CategoryBadge, PRIORITIES, PriorityBadge, STATUSES, type TicketPriority, type TicketStatus,
} from '@/components/support/support-labels';
import { UserSummaryCard } from '@/components/support/user-summary-card';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { PRIORITY, StatusPill, TICKET_STATUS } from '@/lib/labels';
import { canOpen } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type Patch = { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null };

/** One ticket: conversation + composer on the left, user and ticket meta on the right. */
export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = canWriteSupport(me);
  const isSuper = me?.role === 'super_admin';

  const tq = useQuery({
    queryKey: ['support-ticket', id],
    queryFn: async () => (await api.GET('/admin/support/tickets/{id}', { params: { path: { id } } })).data!.data,
    refetchInterval: 30_000,
  });
  const admins = useQuery({
    queryKey: ['admins'],
    queryFn: async () => (await api.GET('/admin/admins')).data!.data,
    enabled: isSuper && canWrite,
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['support-ticket', id] });
    void qc.invalidateQueries({ queryKey: ['support-tickets'] });
    void qc.invalidateQueries({ queryKey: ['support-stats'] });
  };

  const reply = useMutation({
    mutationFn: async (v: ComposerSubmit) => {
      const r = await api.POST('/admin/support/tickets/{id}/messages', {
        params: { path: { id } },
        body: { body: v.body, internal: v.internal, status: v.status },
      });
      return r.data!.data;
    },
    onSuccess: (_m, v) => {
      toast.success(v.internal ? 'Заметка сохранена' : `Ответ отправлен · ${TICKET_STATUS[v.status ?? 'waiting_user']}`);
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const patch = useMutation({
    mutationFn: async (body: Patch) => {
      const r = await api.PATCH('/admin/support/tickets/{id}', { params: { path: { id } }, body });
      return r.data!.data;
    },
    onSuccess: (_r, v) => {
      toast.success(
        v.status
          ? `Статус: ${TICKET_STATUS[v.status]}`
          : v.priority
            ? `Приоритет: ${PRIORITY[v.priority]}`
            : v.assigneeId === null
              ? 'Ответственный снят'
              : 'Ответственный назначен',
      );
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  // Scroll the conversation to the newest message.
  const scroller = useRef<HTMLDivElement>(null);
  const count = tq.data?.messages.length ?? 0;
  const first = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (!el || count === 0) return;
    el.scrollTo({ top: el.scrollHeight, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [count]);

  const t = tq.data;

  if (tq.isPending) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[70vh] rounded-[var(--radius-lg)]" />
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-[var(--radius-lg)]" />
          <Skeleton className="h-72 rounded-[var(--radius-lg)]" />
        </div>
      </div>
    );
  }
  if (!t) {
    return (
      <>
        <BackLink />
        <ErrorNote text={tq.error ? errorText(tq.error) : 'Обращение не найдено.'} />
      </>
    );
  }

  // Assignee options: "Я", "Без ответственного", other admins (super_admin only),
  // and the current assignee if they are not in the list.
  const options: { value: string; label: string }[] = [{ value: '', label: 'Без ответственного' }];
  if (me) options.push({ value: me.id, label: 'Я' });
  for (const a of admins.data ?? []) {
    if (a.id !== me?.id && a.status === 'active') options.push({ value: a.id, label: a.email });
  }
  if (t.assigneeId && !options.some((o) => o.value === t.assigneeId)) {
    options.push({ value: t.assigneeId, label: t.assigneeName ?? 'другой сотрудник' });
  }

  return (
    <>
      <BackLink />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl leading-tight font-semibold tracking-tight text-heading sm:text-[28px]">{t.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <StatusPill map={TICKET_STATUS} value={t.status} />
            <CategoryBadge value={t.category} />
            <PriorityBadge value={t.priority} />
            <span className="ml-1">создано {formatDateTime(t.createdAt)}</span>
          </div>
        </div>
        {!canWrite ? (
          <Badge tone="neutral">
            <Eye size={12} /> только просмотр
          </Badge>
        ) : null}
      </div>
      <ErrorNote text={tq.error ? errorText(tq.error) : null} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Conversation */}
        <Card className="flex flex-col overflow-hidden lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
          <div ref={scroller} className="max-h-[65vh] min-h-72 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6 lg:max-h-none">
            {t.messages.length === 0 ? (
              <EmptyState icon={ChatsCircle} title="Сообщений пока нет" className="border-none" />
            ) : (
              <AnimatePresence initial={false}>
                {t.messages.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
              </AnimatePresence>
            )}
            {t.unreadByUser ? (
              <div className="text-right text-[11px] text-faint">Пользователь ещё не прочитал ответ</div>
            ) : null}
          </div>
          {canWrite && t.status !== 'closed' ? (
            <Composer busy={reply.isPending} onSubmit={(v) => reply.mutateAsync(v).then(() => true, () => false)} />
          ) : (
            <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-5 py-3 text-xs text-muted">
              <LockSimple size={14} weight="light" />
              {canWrite ? 'Обращение закрыто. Откройте его, чтобы ответить.' : 'Ваша роль может только читать обращения.'}
            </div>
          )}
        </Card>

        {/* Side column */}
        <div className="space-y-4">
          <UserSummaryCard u={t.userSummary} canOpenUser={!!me && canOpen(me, '/users')} />
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Обращение</h2>
            <div className="space-y-3.5">
              <Field label="Статус" htmlFor="tk-status">
                <Select
                  id="tk-status"
                  value={t.status}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => patch.mutate({ status: e.target.value as TicketStatus })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TICKET_STATUS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Приоритет" htmlFor="tk-priority">
                <Select
                  id="tk-priority"
                  value={t.priority}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => patch.mutate({ priority: e.target.value as TicketPriority })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Ответственный"
                htmlFor="tk-assignee"
                hint={t.assigneeName && t.assigneeId !== me?.id ? `Сейчас: ${t.assigneeName}` : undefined}
              >
                <Select
                  id="tk-assignee"
                  value={t.assigneeId ?? ''}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => patch.mutate({ assigneeId: e.target.value || null })}
                >
                  {options.map((o) => (
                    <option key={o.value || 'none'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-line pt-4 text-xs">
              <dt className="text-muted">Создано</dt>
              <dd className="text-ink">{formatDateTime(t.createdAt)}</dd>
              <dt className="text-muted">Последнее</dt>
              <dd className="text-ink">{formatDateTime(t.lastMessageAt)}</dd>
              {t.resolvedAt ? (
                <>
                  <dt className="text-muted">Решено</dt>
                  <dd className="text-ink">{formatDateTime(t.resolvedAt)}</dd>
                </>
              ) : null}
              <dt className="text-muted">Сообщений</dt>
              <dd className="text-ink">{t.messages.length}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/support" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
      <ArrowLeft size={15} weight="light" /> Все обращения
    </Link>
  );
}
