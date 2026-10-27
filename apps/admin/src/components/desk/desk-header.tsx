'use client';

import { Badge, type Tone } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deskPost, MY_LEASES_KEY, type DeskSettingsView, type MyLeases } from '@/lib/desk-data';
import { DESK_KINDS, DESK_ROLE_LABEL, KIND_TTL_KEY, type DeskRole } from '@/lib/desk';
import { heldOnDesk } from './my-items';
import { clock, deadlineTone, useNow } from './use-now';
import { DeskGuideButton } from './desk-guide';
import { HeadAppealButton } from './head-appeal';
import { NextButton } from './next-button';

const LIMIT_LABEL: Record<string, string> = {
  'staff.lease.ttl_ticket_min': 'обращение',
  'staff.lease.ttl_verification_min': 'заявка адвоката',
  'staff.lease.ttl_report_min': 'жалоба',
  'staff.lease.ttl_appeal_min': 'обжалование',
  'staff.lease.ttl_finance_min': 'возврат или выплата',
};

const PRESENCE: Record<string, { label: string; tone: Tone }> = {
  online: { label: 'на связи', tone: 'success' },
  away: { label: 'отошёл', tone: 'warning' },
  offline: { label: 'нет на связи', tone: 'neutral' },
};

/**
 * The compact header of the desk: who I am at the desk, presence, how many
 * items I hold, the time limit per kind of item (numbers from the settings),
 * the nearest deadline, «Следующий», the guide and «обжаловать главного».
 */
export function DeskHeader({
  role,
  mode,
  tab,
  settings,
  my,
  canAppeal,
}: {
  role: DeskRole;
  mode: 'own' | 'view';
  tab: string;
  settings: DeskSettingsView;
  my: MyLeases | undefined;
  canAppeal: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const held = heldOnDesk(my, role);
  const now = useNow(held.length > 0);
  const own = mode === 'own';
  const presenceOn = settings.on('staff.presence_enabled') && !!my;
  const away = my?.status === 'away';
  const setAway = useMutation({
    mutationFn: async (a: boolean) => {
      const r = await deskPost('/admin/desk/status', { away: a });
      if (!r.ok) throw new Error('Статус сейчас недоступен.');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: MY_LEASES_KEY }),
    onError: (e) => toast.error(e),
  });

  // The limit per kind of item (a kind that shares the number is drawn once).
  const limits = [...new Set(DESK_KINDS[role].map((k) => KIND_TTL_KEY[k]))].map((key) => ({
    label: LIMIT_LABEL[key] ?? key,
    min: settings.num(key),
  }));
  const nearest = held.reduce<number | null>((min, l) => {
    const left = (new Date(l.leasedUntil).getTime() - now) / 1000;
    return min == null || left < min ? left : min;
  }, null);
  const total = Math.max(...limits.map((l) => l.min), 1) * 60;
  const presence = my ? PRESENCE[my.status] : undefined;
  const capacity = role === 'support' ? my?.capacity.chat : my?.capacity.other;
  const blocked = my?.status === 'away' ? 'Вы в статусе «отошёл»' : undefined;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border border-line bg-surface/70 px-4 py-3" data-testid="desk-header">
      <div className="mr-2 font-serif text-lg font-semibold text-heading">{DESK_ROLE_LABEL[role]}</div>
      {!own ? <Badge tone="info">просмотр: только чтение</Badge> : null}
      {own && presence ? (
        <Badge tone={presence.tone} dot>
          {presence.label}
        </Badge>
      ) : null}
      {own && presenceOn && my?.status !== 'offline' ? (
        <Button variant="outline" size="sm" loading={setAway.isPending} onClick={() => setAway.mutate(!away)}>
          {away ? 'Вернуться на связь' : 'Отошёл'}
        </Button>
      ) : null}
      {own && my ? (
        <span className="text-sm text-muted">
          В работе: <span className="font-semibold tabular-nums text-heading">{held.length}</span>
          {capacity ? ` из ${capacity}` : ''}
        </span>
      ) : null}
      {own && nearest != null ? (
        <Badge tone={deadlineTone(total - nearest, total)}>{nearest > 0 ? `ближайший срок ${clock(nearest)}` : 'срок вышел'}</Badge>
      ) : null}
      <span className="hidden h-4 w-px bg-line md:block" />
      <span className="text-xs text-faint" data-testid="desk-limits">
        Срок на элемент:{' '}
        {limits.map((l, i) => (
          <span key={l.label}>
            {i > 0 ? ', ' : ''}
            {l.label} — {l.min} мин
          </span>
        ))}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {own ? <NextButton role={role} tab={tab} settings={settings} blocked={blocked} /> : null}
        <DeskGuideButton role={role} />
        {own ? <HeadAppealButton enabled={canAppeal} /> : null}
      </div>
    </div>
  );
}
