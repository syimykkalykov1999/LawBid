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
    // Owner 2026-11-02 (slow-link audit): the Sentry SDK is the biggest
    // script of the panel (130 KB gzipped). It used to start downloading
    // right after hydration, in parallel with the page's own data; on a
    // 1-2 Mbit/s link that doubled the wait. It now loads when the browser
    // is idle (at the latest 4 s after the page opened).
    const start = () => void (async () => {
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
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(start, 3000);
    return () => clearTimeout(t);
  }, [dsn]);
  return null;
}
