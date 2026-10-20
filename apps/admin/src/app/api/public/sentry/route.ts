import { NextResponse } from 'next/server';
import { apiBaseUrl } from '@/lib/api/server';

/**
 * Owner 2026-10-20: the admin panel's Sentry DSN lives in Admin →
 * Integrations → Sentry (field «адрес для отчётов админки»), not in the
 * build. The API publishes it in GET /config/bootstrap (a DSN only lets one
 * send events); this route hands it to the page. Public on purpose — the
 * login page reports errors too.
 */
export async function GET() {
  try {
    const res = await fetch(`${apiBaseUrl()}/config/bootstrap`, {
      cache: 'no-store',
    });
    const body = (await res.json()) as {
      data?: { app_config?: Record<string, unknown> };
    };
    const dsn = body.data?.app_config?.['sentry.admin_dsn'];
    return NextResponse.json(
      { dsn: typeof dsn === 'string' ? dsn : null },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch {
    return NextResponse.json({ dsn: null });
  }
}
