'use client';

import { useEffect } from 'react';

/**
 * Owner 2026-10-20: browser error reports of the admin panel. Production
 * only; the DSN comes from the server (Admin → Integrations → Sentry), so
 * changing it needs no rebuild. Nothing is sent when it is empty.
 */
export function SentryInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/public/sentry');
        const { dsn } = (await res.json()) as { dsn: string | null };
        if (!dsn || cancelled) return;
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
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
