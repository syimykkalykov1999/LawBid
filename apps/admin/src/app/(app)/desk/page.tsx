'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DeskNotFound } from '@/components/desk/desk-not-found';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { deskHome, desksFor, DESK_ROLE_LABEL, deskPath } from '@/lib/desk';
import { useDeskSettings } from '@/lib/desk-data';
import { useMe } from '@/lib/hooks';

/** /desk: a worker goes to their own desk, a head or the owner picks one to look at. */
export default function DeskIndexPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const settings = useDeskSettings(me);
  const deskOn = settings.on('staff.desk_enabled');
  const home = deskHome(me, deskOn);
  useEffect(() => {
    if (home) router.replace(home);
  }, [home, router]);
  if (!me || settings.loading || home) return <Skeleton className="h-40 w-full" />;
  const desks = desksFor(me, deskOn);
  if (desks.length === 0) return <DeskNotFound />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {desks.map((d) => (
        <Link key={d.role} href={deskPath(d.role)}>
          <Card className="p-5 transition-colors hover:border-gold/60">
            <div className="font-serif text-lg font-semibold text-heading">{DESK_ROLE_LABEL[d.role]}</div>
            <p className="mt-1 text-sm text-muted">Посмотреть, как выглядит стол и кто что держит. Только чтение.</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
