import { NextResponse } from 'next/server';
import { apiBaseUrl, sessionToken } from '@/lib/api/server';
import { crossSiteReason } from '@/lib/csrf';

/**
 * Speed matrix 2026-11-09 (§3 #5): the browser cannot present the admin
 * JWT (httpOnly cookie) at a socket handshake, so it asks here; this route
 * asks the API for a one-shot ticket with the cookie's token and adds the
 * origin the browser must connect to — the API host the panel itself
 * talks to (ADMIN_SOCKET_ORIGIN overrides it when the sockets live on
 * another host).
 */
export function socketOrigin(): string {
  const set = process.env.ADMIN_SOCKET_ORIGIN?.trim();
  if (set) return set.replace(/\/$/, '');
  return new URL(apiBaseUrl()).origin;
}

export async function POST(req: Request): Promise<Response> {
  if (crossSiteReason(req)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Cross-site request refused.' } }, { status: 403 });
  }
  const token = await sessionToken();
  if (!token) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'No admin session.' } }, { status: 401 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/admin/realtime/ticket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The server is not reachable right now.' } },
      { status: 502 },
    );
  }
  const payload = (await upstream.json().catch(() => null)) as {
    data?: { enabled: boolean; ticket: string | null; namespace: string; ttlSec: number };
  } | null;
  if (!upstream.ok || !payload?.data) {
    return NextResponse.json(payload ?? { error: { code: 'UPSTREAM_UNAVAILABLE' } }, { status: upstream.status });
  }
  return NextResponse.json({ data: { ...payload.data, origin: socketOrigin() } });
}
