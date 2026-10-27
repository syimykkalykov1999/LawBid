import { Suspense } from 'react';
import { AppealsInbox } from '@/components/staff/appeals-inbox';

export default function Page() {
  return (
    <Suspense>
      <AppealsInbox />
    </Suspense>
  );
}
