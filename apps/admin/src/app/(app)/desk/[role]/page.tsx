'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { DeskPage } from '@/components/desk/desk-page';
import { Skeleton } from '@/components/ui/empty';

/** Staff package T8: /desk/verifier | moderator | support | finance. */
export default function DeskRolePage() {
  const { role } = useParams<{ role: string }>();
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <DeskPage role={role} />
    </Suspense>
  );
}
