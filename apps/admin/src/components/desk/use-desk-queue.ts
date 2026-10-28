'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { useNextVerification } from '@/components/workspace/queue-next';
import { deskPost, MY_LEASES_KEY, type DeskSettingsView, type NextOutcome } from '@/lib/desk-data';
import { supportReviewHref } from '@/lib/review-flow';
import { itemHref, KIND_SWITCH, LEASE_SERVED, TAB_KIND, type DeskRole, type LeaseKind } from '@/lib/desk';

/**
 * Everything the desk needs from a queue goes through this one hook, so a
 * tab never knows how an item is handed out (T4 filled the slot T8 left; the
 * timers, the renewal and «Пропустить» live in lease-strip / lease-hooks). Today:
 *  - `lease`: the T3 engine serves the queue (`staff.lease_enabled` + the
 *    queue's own switch) → `POST admin/desk/lease/next { kind }`; the item
 *    is pinned to the worker and opened;
 *  - `legacy`: the engine is off → the queue's old opener (verification:
 *    the oldest waiting request, support: «Следующее обращение»);
 *  - `none`: the queue has no «Следующий» (moderation / finance with the
 *    engine off): the button is not drawn.
 */
export type QueueMode = 'lease' | 'legacy' | 'none';

export interface DeskQueue {
  kind: LeaseKind | null;
  mode: QueueMode;
  pending: boolean;
  next: () => void;
}

const LEGACY: Partial<Record<LeaseKind, true>> = { verification: true, support_ticket: true };

export function queueMode(settings: DeskSettingsView, kind: LeaseKind | null): QueueMode {
  if (!kind) return 'none';
  if (LEASE_SERVED.includes(kind) && settings.on('staff.lease_enabled') && settings.on(KIND_SWITCH[kind])) return 'lease';
  return LEGACY[kind] ? 'legacy' : 'none';
}

/** The words for what the engine answered (null = an item was taken). */
export function outcomeText(o: NextOutcome): string | null {
  switch (o.status) {
    case 'leased':
      return null;
    case 'busy':
      return 'У вас уже есть элемент в работе: закончите его или отпустите, потом берите следующий.';
    case 'empty':
      return 'Очередь пуста: свободных элементов нет.';
    case 'wrap_up':
      return `Короткая пауза после диалога: следующий можно взять через ${o.retryAfterSec} с.`;
    case 'away':
      return 'Вы в статусе «отошёл»: вернитесь «на связь», чтобы получать работу.';
    case 'offline':
      return 'Нет сигнала «на связи»: проверьте интернет.';
    default:
      return 'Раздача для этой очереди выключена.';
  }
}

export function useDeskQueue(role: DeskRole, tab: string, settings: DeskSettingsView): DeskQueue {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const kind = TAB_KIND[role][tab] ?? null;
  const mode = queueMode(settings, kind);
  const legacyVerification = useNextVerification();
  const legacySupport = useMutation({
    mutationFn: async () => (await api.POST('/admin/support/tickets/next')).data!.data,
    onSuccess: (r) => {
      if (r.ticket) router.push(supportReviewHref(r.ticket.id));
      else toast.success('Очередь пуста: открытых обращений нет');
    },
    onError: (e) => toast.error(e),
  });
  const lease = useMutation({
    mutationFn: async () => {
      const r = await deskPost<NextOutcome>('/admin/desk/lease/next', { kind });
      if (!r.ok) throw new Error('missing');
      return r.data;
    },
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: MY_LEASES_KEY });
      if (o.status === 'leased') {
        const href = itemHref(o.lease.kind, o.lease.itemId, o.lease.targetType);
        if (href) router.push(href);
        else toast.success('Элемент закреплён за вами: он на вкладке «Мои».');
        return;
      }
      toast.success(outcomeText(o) ?? '');
    },
    onError: (e) => {
      // The route is not on this server yet: work the old way.
      if (e instanceof Error && e.message === 'missing' && kind && LEGACY[kind]) {
        if (kind === 'verification') legacyVerification.mutate();
        else legacySupport.mutate();
        return;
      }
      toast.error(e);
    },
  });

  if (mode === 'none' || !kind) return { kind, mode: 'none', pending: false, next: () => undefined };
  if (mode === 'lease') return { kind, mode, pending: lease.isPending || legacyVerification.isPending || legacySupport.isPending, next: () => lease.mutate() };
  return {
    kind,
    mode,
    pending: kind === 'verification' ? legacyVerification.isPending : legacySupport.isPending,
    next: () => (kind === 'verification' ? legacyVerification.mutate() : legacySupport.mutate()),
  };
}
