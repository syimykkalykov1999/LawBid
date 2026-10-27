import { apiBaseUrl } from '@/lib/api/server';

/**
 * S18-13: the admin Sentry DSN, read once on the server (Admin → Integrations
 * → Sentry) and handed to the page as a prop, so the browser needs no extra
 * round trip and early errors are not lost. Cached for 5 minutes per task.
 */
let cache: { dsn: string | null; at: number } | null = null;
const TTL_MS = 5 * 60_000;

export async function sentryDsn(): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.dsn;
  let dsn: string | null = null;
  try {
    const res = await fetch(`${apiBaseUrl()}/config/bootstrap`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });
    const body = (await res.json()) as {
      data?: { app_config?: Record<string, unknown> };
    };
    const v = body.data?.app_config?.['sentry.admin_dsn'];
    dsn = typeof v === 'string' && v ? v : null;
  } catch {
    // Reporting must never break a page; try again next time.
    cache = null;
    return null;
  }
  cache = { dsn, at: Date.now() };
  return dsn;
}
