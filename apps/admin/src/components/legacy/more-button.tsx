'use client';

import { Button } from '@/components/ui/button';

/** "Показать ещё" under a cursor-paged list. */
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
    <div className="mt-4 flex justify-center">
      <Button variant="outline" loading={loading} onClick={onClick}>
        Показать ещё
      </Button>
    </div>
  );
}
