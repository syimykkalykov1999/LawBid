'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { deskPost, MY_LEASES_KEY, type DeskSettingsView, type LeaseView, type MyLeases } from '@/lib/desk-data';
import { itemHref, KIND_LABEL, KIND_TTL_KEY, SKIP_REASONS, type DeskRole, type LeaseKind } from '@/lib/desk';
import { heldOnDesk } from './my-items';
import { useLeaseAutoRenew, useRefreshOnDecision } from './lease-hooks';
import { clock, deadlineTone, useNow } from './use-now';

/**
 * Staff package T4: «Сейчас в работе» — the card of the item pinned to me:
 * what it is, the countdown (green, yellow from 75 % of the time, red when
 * over), «Открыть», «Пропустить» with a reason and «Отпустить». Closing is
 * the decision itself (the buttons of the opened card): the server ends the
 * lease and the card goes away. Also keeps the lease alive while I move.
 */
export function LeaseStrip({
  role,
  settings,
  my,
  hidden = false,
}: {
  role: DeskRole;
  settings: DeskSettingsView;
  my: MyLeases | undefined;
  /** The tab already lists my items («Мои»): keep the lease alive, draw nothing. */
  hidden?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const held = heldOnDesk(my, role);
  const on = settings.on('staff.lease_enabled');
  const now = useNow(held.length > 0);
  const [skipFor, setSkipFor] = useState<string | null>(null);
  const ttlSec = (kind: string) => settings.num(KIND_TTL_KEY[kind as LeaseKind] ?? 'staff.lease.ttl_ticket_min') * 60;
  useLeaseAutoRenew(held, ttlSec, on && held.length > 0);
  useRefreshOnDecision(on);

  const release = useMutation({
    mutationFn: async (l: LeaseView) => {
      const r = await deskPost(`/admin/desk/lease/${l.kind}/${l.itemId}/release`);
      if (!r.ok) throw new Error('Раздача сейчас недоступна.');
    },
    onSuccess: () => {
      toast.success('Элемент отпущен: его возьмёт другой.');
      void qc.invalidateQueries({ queryKey: MY_LEASES_KEY });
    },
    onError: (e) => toast.error(e),
  });
  const skip = useMutation({
    mutationFn: async (a: { l: LeaseView; reason: string }) => {
      const r = await deskPost<{ ok: boolean; limited: boolean }>(`/admin/desk/lease/${a.l.kind}/${a.l.itemId}/skip`, { reason: a.reason });
      if (!r.ok) throw new Error('Раздача сейчас недоступна.');
      return r.data;
    },
    onSuccess: (r) => {
      setSkipFor(null);
      if (r.limited) toast.error(new Error('Пропусков в час больше нельзя: закончите этот элемент или отпустите его.'));
      else toast.success('Пропущено: элемент уйдёт другому, не вам.');
      void qc.invalidateQueries({ queryKey: MY_LEASES_KEY });
    },
    onError: (e) => toast.error(e),
  });

  if (!on || hidden || held.length === 0) return null;
  return (
    <div className="mb-4 space-y-2" data-testid="lease-strip" aria-label="Сейчас в работе">
      {held.map((l) => {
        const kind = l.kind as LeaseKind;
        const left = (new Date(l.leasedUntil).getTime() - now) / 1000;
        const total = ttlSec(l.kind);
        const href = itemHref(l.kind, l.itemId, l.targetType);
        const key = `${l.kind}:${l.itemId}`;
        return (
          <Card key={key} className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wide text-faint">Сейчас в работе</div>
                <div className="font-medium text-heading">
                  {KIND_LABEL[kind] ?? l.kind} <span className="font-mono text-xs text-faint">{l.itemId.slice(0, 8)}</span>
                </div>
              </div>
              <Badge tone={deadlineTone(total - left, total)} aria-label="Осталось времени">
                {left > 0 ? `осталось ${clock(left)}` : 'время вышло'}
              </Badge>
              {href ? (
                <Link href={href} className="text-sm text-gold-600 hover:underline">
                  Открыть
                </Link>
              ) : null}
              <Button variant="outline" size="sm" disabled={skip.isPending} onClick={() => setSkipFor(skipFor === key ? null : key)}>
                Пропустить
              </Button>
              <Button variant="outline" size="sm" disabled={release.isPending} onClick={() => release.mutate(l)}>
                Отпустить
              </Button>
            </div>
            {skipFor === key ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3" role="group" aria-label="Причина пропуска">
                <span className="text-sm text-muted">Почему пропускаете?</span>
                {SKIP_REASONS.map((r) => (
                  <Button key={r.value} variant="ghost" size="sm" disabled={skip.isPending} onClick={() => skip.mutate({ l, reason: r.value })}>
                    {r.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
