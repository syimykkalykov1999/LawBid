'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/empty';
import { Tabs } from '@/components/ui/tabs';
import { desksFor, DESK_ROLE_SHORT, deskAccess, deskPath, isDeskRole, tabKeyOrFirst, tabsFor, type DeskRole } from '@/lib/desk';
import { useDeskSettings, useMyLeases } from '@/lib/desk-data';
import { REVIEW_TAB, useReviewAccess } from '@/lib/desk-review';
import { useMe, type Me } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { heldOnDesk } from './my-items';
import { DeskHeader } from './desk-header';
import { DeskNotFound } from './desk-not-found';
import { TabBody } from './tab-body';

/**
 * Staff package T8: the ONE page of a worker with the tabs of the desk on
 * top. Off (workspaces or `staff.desk_enabled` off, or not your desk) means
 * «Такой страницы нет», exactly like a section that is not yours.
 */
export function DeskPage({ role }: { role: string }) {
  const { data: me } = useMe();
  const settings = useDeskSettings(me);
  if (!me || settings.loading) return <Skeleton className="h-40 w-full" />;
  if (!isDeskRole(role)) return <DeskNotFound />;
  const mode = deskAccess(me, role, settings.on('staff.desk_enabled'));
  if (!mode) return <DeskNotFound />;
  return <DeskBody me={me} role={role} mode={mode} />;
}

function DeskBody({ me, role, mode }: { me: Me; role: DeskRole; mode: 'own' | 'view' }) {
  const router = useRouter();
  const params = useSearchParams();
  const settings = useDeskSettings(me);
  // T9: «Перепроверка» exists only for who may re-check (owner, head, senior worker).
  const review = useReviewAccess(settings.on('staff.rating_enabled')).data ?? null;
  const tab = review && params.get('tab') === REVIEW_TAB ? REVIEW_TAB : tabKeyOrFirst(role, params.get('tab'), mode);
  const own = mode === 'own';
  const leaseOn = settings.on('staff.lease_enabled') || settings.on('staff.presence_enabled');
  const leases = useMyLeases(own && leaseOn);
  const my = leases.data && leases.data.ok ? leases.data.data : undefined;
  const held = heldOnDesk(my, role).length;
  // A head / the owner can hop between the desks they may look at.
  const desks = desksFor(me, true);
  // A worker complains about their head; the head and the owner do not.
  const canAppeal = own && !me.workspaceHead && me.role !== 'super_admin' && settings.on('staff.appeals_enabled');

  return (
    <div data-testid={`desk-${role}`}>
      {desks.some((d) => d.mode === 'view') ? (
        <nav aria-label="Столы" className="mb-3 flex flex-wrap gap-2 text-sm">
          {desks.map((d) => (
            <Link
              key={d.role}
              href={deskPath(d.role)}
              className={cn('rounded-full border px-3 py-1', d.role === role ? 'border-gold/60 bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink')}
            >
              {DESK_ROLE_SHORT[d.role]}
            </Link>
          ))}
        </nav>
      ) : null}
      <DeskHeader role={role} mode={mode} tab={tab} settings={settings} my={my} canAppeal={canAppeal} />
      <Tabs<string>
        className="mb-5"
        value={tab}
        onChange={(k) => router.replace(deskPath(role, k), { scroll: false })}
        items={[
          ...tabsFor(role, mode).map((t) => ({
            value: t.key,
            label: t.label,
            count: t.key === 'mine' || t.key === 'tasks' ? (held > 0 ? held : null) : null,
          })),
          ...(review ? [{ value: REVIEW_TAB, label: 'Перепроверка', count: null }] : []),
        ]}
      />
      <TabBody
        role={role}
        tab={tab}
        settings={settings}
        my={my}
        myLoading={own && leaseOn && leases.isPending}
        myMissing={!!leases.data && !leases.data.ok}
        statsOn={settings.on('staff.worker_progress_enabled')}
        review={review}
      />
    </div>
  );
}
