'use client';

import { Tray } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { deskPost, MY_LEASES_KEY, type DeskSettingsView, type LeaseView, type MyLeases } from '@/lib/desk-data';
import { DESK_KINDS, itemHref, KIND_LABEL, KIND_TTL_KEY, type DeskRole, type LeaseKind } from '@/lib/desk';
import { clock, deadlineTone, useNow } from './use-now';

/** The items held by me on this desk (kinds of the desk only). */
export function heldOnDesk(my: MyLeases | undefined, role: DeskRole): LeaseView[] {
  return (my?.leases ?? []).filter((l) => (DESK_KINDS[role] as readonly string[]).includes(l.kind));
}

/**
 * «Мои»: what is in my hands now, with the time left and the buttons to let
 * it go (closing happens with the decision itself; «Пропустить» with a reason is on the card in lease-strip). Data: `admin/desk/lease/me` (T3). While the engine is
 * off or not on this server the tab says so and shows nothing else.
 */
export function MyItems({
  role,
  settings,
  my,
  loading,
  missing,
}: {
  role: DeskRole;
  settings: DeskSettingsView;
  my: MyLeases | undefined;
  loading: boolean;
  missing: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const held = heldOnDesk(my, role);
  const now = useNow(held.length > 0);
  const act = useMutation({
    mutationFn: async (a: { l: LeaseView; op: 'release' }) => {
      const r = await deskPost(`/admin/desk/lease/${a.l.kind}/${a.l.itemId}/${a.op}`);
      if (!r.ok) throw new Error('Раздача сейчас недоступна.');
    },
    onSuccess: () => {
      toast.success('Элемент отпущен: его возьмёт другой.');
      void qc.invalidateQueries({ queryKey: MY_LEASES_KEY });
    },
    onError: (e) => toast.error(e),
  });

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (missing || !settings.on('staff.lease_enabled')) {
    return (
      <EmptyState
        icon={Tray}
        title="Закрепление пока выключено"
        text="Когда владелец включит раздачу «Следующий», здесь будет то, что сейчас у вас в работе, и таймер."
      />
    );
  }
  if (held.length === 0) {
    return <EmptyState icon={Tray} title="В работе пусто" text="Нажмите «Следующий»: элемент закрепится за вами, остальные его не увидят." />;
  }
  return (
    <div className="space-y-3">
      {held.map((l) => {
        const kind = l.kind as LeaseKind;
        const left = (new Date(l.leasedUntil).getTime() - now) / 1000;
        const total = settings.num(KIND_TTL_KEY[kind] ?? 'staff.lease.ttl_ticket_min') * 60;
        const href = itemHref(l.kind, l.itemId);
        return (
          <Card key={`${l.kind}:${l.itemId}`} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-heading">{KIND_LABEL[kind] ?? l.kind}</div>
              <div className="font-mono text-xs text-faint">{l.itemId.slice(0, 8)}</div>
            </div>
            <Badge tone={deadlineTone(total - left, total)} aria-label="Осталось времени">
              {left > 0 ? `осталось ${clock(left)}` : 'время вышло'}
            </Badge>
            {href ? (
              <Link href={href} className="text-sm text-gold-600 hover:underline">
                Открыть
              </Link>
            ) : null}
            <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate({ l, op: 'release' })}>
              Отпустить
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
