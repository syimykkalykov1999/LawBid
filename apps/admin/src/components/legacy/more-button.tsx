'use client';

import { Button } from '@/components/ui/button';
import { PrefetchSentinel } from './prefetch-sentinel';

/** "Показать ещё" under a cursor-paged list; the next page is also fetched
 *  ahead while the admin scrolls near it (PrefetchSentinel, item 38). */
export function MoreButton({
  show,
  loading,
  onClick,
}: {
  show: boolean | undefined;
  loading?: boolean;
  onClick: () => void;
}) {
  if (!show) return null;
  return (
    <>
      <PrefetchSentinel enabled={!loading} onNear={onClick} />
      <div className="mt-4 flex justify-center">
        <Button variant="outline" loading={loading} onClick={onClick}>
          Показать ещё
        </Button>
      </div>
    </>
  );
}
