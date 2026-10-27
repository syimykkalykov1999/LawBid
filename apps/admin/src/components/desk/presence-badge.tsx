'use client';

import { Badge, type Tone } from '@/components/ui/card';
import { useDeskSettings, useMyLeases } from '@/lib/desk-data';
import { navModeFor } from '@/lib/rbac';
import { useMe } from '@/lib/hooks';
import { useDeskHeartbeat } from './lease-hooks';

const PRESENCE: Record<string, { label: string; tone: Tone }> = {
  online: { label: 'на связи', tone: 'success' },
  away: { label: 'отошёл', tone: 'warning' },
  offline: { label: 'нет на связи', tone: 'neutral' },
};

/**
 * Staff package T4: the presence of a desk-mode worker in the top bar. It
 * also sends the presence signal every 15 s for as long as the panel is
 * open (on any page), and shows «на связи» / «отошёл» / «нет на связи».
 * Nothing at all while presence is switched off or for anybody who has no
 * desk (the owner, a partner).
 */
export function PresenceBadge() {
  const { data: me } = useMe();
  const settings = useDeskSettings(me);
  const worker = !!me && navModeFor(me) === 'desk' && settings.on('staff.desk_enabled');
  const on = worker && settings.on('staff.presence_enabled');
  useDeskHeartbeat(on, settings.num('staff.presence.heartbeat_sec'));
  const q = useMyLeases(on);
  const status = q.data && q.data.ok ? q.data.data.status : null;
  const p = status ? PRESENCE[status] : undefined;
  if (!on || !p) return null;
  return (
    <Badge tone={p.tone} dot data-testid="presence-badge">
      {p.label}
    </Badge>
  );
}
