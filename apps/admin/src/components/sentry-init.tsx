'use client';

import { useEffect } from 'react';

/**
 * Owner 2026-10-20: browser error reports of the admin panel. Production
 * only; the DSN comes from the server (Admin → Integrations → Sentry), so
 * changing it needs no rebuild. Nothing is sent when it is empty.
 * S18-13: the root layout reads the DSN on the server and passes it in, so
 * there is no extra request per page load.
 */
export function SentryInit({ dsn }: { dsn: string | null }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !dsn) return;
    void (async () => {
      try {
        const [Sentry, { scrubEvent }] = await Promise.all([
          import('@sentry/browser'),
          import('@/lib/sentry'),
        ]);
        if (Sentry.getClient()) return;
        Sentry.init({
          dsn,
          environment: 'production',
          sendDefaultPii: false,
          tracesSampleRate: 0,
          beforeSend: (event) => scrubEvent(event),
        });
      } catch {
        // Reporting must never be the next error.
      }
    })();
  }, [dsn]);
  return null;
}
