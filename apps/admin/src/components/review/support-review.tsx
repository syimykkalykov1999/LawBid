'use client';

import { ChatsCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Composer, type ComposerSubmit } from '@/components/support/composer';
import { DeviceCard } from '@/components/support/device-card';
import { MessageBubble } from '@/components/support/message-bubble';
import { canWriteSupport, CategoryBadge, PriorityBadge, SlaBadge } from '@/components/support/support-labels';
import { UserSummaryCard } from '@/components/support/user-summary-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { livePoll } from '@/lib/live';
import { StatusPill, TICKET_STATUS } from '@/lib/labels';
import { canOpen } from '@/lib/rbac';
import { supportReviewHref } from '@/lib/review-flow';
import { ReviewShell, type ReviewAction } from './review-shell';
import { useReviewFlow } from './use-review-flow';

/** Same key and call as the ticket page: one cache for both. */
export const ticketKey = (id: string) => ['support-ticket', id] as const;

const HINT = [
  { key: 'Ctrl/⌘+Enter', text: 'ответить и дальше' },
  { key: 'N', text: 'пропустить' },
] as const;

/**
 * Owner 2026-10-28: support conversations in a row. The conversation, the
 * reply box (ready answers, files, Ctrl/⌘+Enter) and the user on one screen;
 * «Ответить и дальше», «Закрыть и дальше», «Передать и дальше» open the next
 * ticket in place. The next ticket is NOT warmed up in advance: opening a
 * ticket marks it read for the team, so it is loaded only when shown.
 */
export function SupportReview() {
  const params = useSearchParams();
  const id0 = params.get('id');
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = canWriteSupport(me);
  const myId = me?.id;

  const flow = useReviewFlow<string>({
    kind: 'support_ticket',
    initial: id0,
    keyOf: (id) => id,
    // The old «Следующее обращение»: my most urgent, else the most overdue free one (taken by me).
    take: async () => (await api.POST('/admin/support/tickets/next')).data?.data.ticket?.id ?? null,
    candidates: async () => {
      const r = await api.GET('/admin/support/tickets', { params: { query: { status: 'open', sla: 'waiting' } } });
      return (r.data?.data ?? []).filter((t) => !t.assigneeId || t.assigneeId === myId).map((t) => t.id);
    },
    fromLease: (l) => (l.kind === 'support_ticket' ? l.itemId : null),
    prefetch: () => undefined,
    hrefOf: (id) => supportReviewHref(id),
  });
  const cur = flow.current;

  const tq = useQuery({
    queryKey: ticketKey(cur ?? ''),
    enabled: !!cur,
    refetchInterval: livePoll(),
    queryFn: async () => (await api.GET('/admin/support/tickets/{id}', { params: { path: { id: cur! } } })).data!.data,
  });
  const t = cur && tq.data && tq.data.id === cur ? tq.data : undefined;

  const userLanguage = t?.userSummary.uiLanguage;
  const macros = useQuery({
    queryKey: ['support-macros', 'active', userLanguage ?? ''],
    queryFn: async () => (await api.GET('/admin/support/macros', { params: { query: { language: userLanguage } } })).data!.data,
    enabled: canWrite && !!userLanguage,
    staleTime: 60_000,
  });

  const invalidate = (id: string) => {
    void qc.invalidateQueries({ queryKey: ticketKey(id) });
    void qc.invalidateQueries({ queryKey: ['support-tickets'] });
    void qc.invalidateQueries({ queryKey: ['support-stats'] });
  };

  const reply = useMutation({
    mutationFn: async (v: ComposerSubmit) => {
      await api.POST('/admin/support/tickets/{id}/messages', {
        params: { path: { id: cur! } },
        body: {
          body: v.body,
          internal: v.internal,
          status: v.status,
          macroId: v.macroId,
          attachments: v.attachments.length > 0 ? v.attachments : undefined,
        },
      });
      return v;
    },
    onSuccess: (v) => {
      if (!cur) return;
      toast.success(v.internal ? 'Заметка сохранена' : `Ответ отправлен · ${TICKET_STATUS[v.status ?? 'waiting_user']}`);
      invalidate(cur);
      if (v.macroId) void qc.invalidateQueries({ queryKey: ['support-macros'] });
      // A note keeps the ticket on screen; a reply opens the next one.
      if (!v.internal) return flow.advance('replied');
    },
    onError: (e) => toast.error(e),
  });

  const patch = useMutation({
    mutationFn: async (body: { status?: 'resolved'; assigneeId?: string | null }) => {
      await api.PATCH('/admin/support/tickets/{id}', { params: { path: { id: cur! } }, body });
      return body;
    },
    onSuccess: (body) => {
      if (!cur) return;
      toast.success(body.status ? 'Обращение закрыто' : body.assigneeId ? 'Обращение передано' : 'Обращение вернулось в общую очередь');
      invalidate(cur);
      return flow.advance(body.status ? 'resolved' : 'transferred');
    },
    onError: (e) => toast.error(e),
  });

  // «Передать»: the support team on shift first (not me), or back to the common queue.
  const [transferOpen, setTransferOpen] = useState(false);
  useEffect(() => setTransferOpen(false), [cur]);
  const agents = useQuery({
    queryKey: ['support-agents'],
    queryFn: async () => (await api.GET('/admin/support/agents')).data!.data,
    enabled: transferOpen,
    staleTime: 60_000,
  });
  const people = (agents.data ?? []).filter((a) => a.adminId !== myId).sort((a, b) => Number(b.onShift) - Number(a.onShift));

  // The action bar's «Ответить и дальше» presses the reply box's send.
  const sendRef = useRef<(() => void) | null>(null);
  const [replyReady, setReplyReady] = useState(false);
  const onReadyChange = useCallback((r: boolean) => setReplyReady(r), []);

  // Scroll the conversation to the newest message.
  const scroller = useRef<HTMLDivElement>(null);
  const count = t?.messages.length ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (el && count > 0) el.scrollTop = el.scrollHeight;
  }, [count, cur]);

  const open = !!t && t.status !== 'closed';
  const busy = reply.isPending || patch.isPending;
  const actions: ReviewAction[] = [
    {
      id: 'transfer',
      label: 'Передать и дальше',
      variant: 'outline',
      disabled: !canWrite || !open,
      run: () => setTransferOpen((v) => !v),
    },
    {
      id: 'close',
      label: 'Закрыть и дальше',
      variant: 'outline',
      disabled: !canWrite || !t || t.status === 'resolved' || t.status === 'closed',
      run: () => patch.mutate({ status: 'resolved' }),
    },
    {
      id: 'reply',
      label: 'Ответить и дальше',
      variant: 'gold',
      disabled: !canWrite || !open || !replyReady,
      run: () => sendRef.current?.(),
    },
  ];

  const panel = transferOpen ? (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2" role="group" aria-label="Кому передать">
      <span className="text-sm text-muted">Кому передать?</span>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => patch.mutate({ assigneeId: null })}>
        В общую очередь
      </Button>
      {agents.isPending ? <span className="text-xs text-faint">загрузка…</span> : null}
      {people.map((a) => (
        <Button key={a.adminId} variant="ghost" size="sm" disabled={busy} onClick={() => patch.mutate({ assigneeId: a.adminId })}>
          {a.name}
          {a.onShift ? null : <span className="text-faint"> · не на смене</span>}
        </Button>
      ))}
    </div>
  ) : null;

  return (
    <ReviewShell
      eyebrow="Поддержка · обращения подряд"
      title={t?.subject ?? 'Обращение'}
      subtitle={
        t && cur ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <StatusPill map={TICKET_STATUS} value={t.status} />
            <CategoryBadge value={t.category} />
            <PriorityBadge value={t.priority} />
            {t.status === 'open' ? <SlaBadge dueAt={t.slaDueAt} breached={t.slaBreached} /> : null}
            <Link href={`/support/${cur}`} className="text-gold-600 hover:underline">
              полная карточка
            </Link>
          </span>
        ) : null
      }
      flow={flow}
      actions={actions}
      busy={busy}
      backHref="/support"
      backLabel="Все обращения"
      emptyText="Очередь пуста: вы ответили на всё."
      hint={HINT}
      loading={!t}
      panel={panel}
    >
      {t ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="flex flex-col overflow-hidden">
            <div ref={scroller} className="max-h-[55vh] min-h-60 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" data-testid="support-review-messages">
              {t.messages.length === 0 ? (
                <EmptyState icon={ChatsCircle} title="Сообщений пока нет" className="border-none" />
              ) : (
                <AnimatePresence initial={false}>
                  {t.messages.map((m) => (
                    <MessageBubble key={m.id} m={m} />
                  ))}
                </AnimatePresence>
              )}
            </div>
            {canWrite && open ? (
              <Composer
                key={cur}
                busy={reply.isPending}
                macros={macros.data ?? []}
                hideReplyButton
                sendRef={sendRef}
                onReadyChange={onReadyChange}
                onSubmit={(v) => reply.mutateAsync(v).then(() => true, () => false)}
              />
            ) : (
              <div className="border-t border-line bg-surface-2 px-5 py-3 text-xs text-muted">
                {canWrite ? 'Обращение закрыто.' : 'Ваша роль может только читать обращения.'}
              </div>
            )}
          </Card>
          <div className="space-y-4">
            <UserSummaryCard u={t.userSummary} canOpenUser={!!me && canOpen(me, '/users')} />
            {t.clientContext ? <DeviceCard c={t.clientContext} /> : null}
          </div>
        </div>
      ) : null}
    </ReviewShell>
  );
}
