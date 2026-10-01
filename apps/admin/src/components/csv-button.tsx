'use client';

import { Button } from '@/components/ui/button';

/** Downloads `/admin/export/<entity>` as a CSV file (through the proxy,
 * which adds the admin session). */
export function CsvButton({ entity, label = 'CSV' }: { entity: string; label?: string }) {
  return (
    <Button
      variant="outline"
      onClick={() => window.location.assign(`/api/proxy/export/${entity}`)}
    >
      {label}
    </Button>
  );
}
