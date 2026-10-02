import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  apiBaseUrl,
  cookieOptions,
  sessionToken,
} from '@/lib/api/server';

/**
 * The last sign-in step runs here, not in the browser: the TOTP (or
 * recovery) exchange is forwarded to the API and the returned admin JWT
 * goes straight into the httpOnly cookie. The response passes the rest
 * (admin, recoveryCodes) through.
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    ticket: string;
    code?: string;
    recoveryCode?: string;
  };
  const path = body.recoveryCode ? '/admin/auth/recovery' : '/admin/auth/totp';
  const upstream = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
      'user-agent': req.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify(
      body.recoveryCode
        ? { ticket: body.ticket, recoveryCode: body.recoveryCode }
        : { ticket: body.ticket, code: body.code },
    ),
    cache: 'no-store',
  });
  // A non-JSON upstream answer (ALB 502, gateway timeout) must not turn
  // into an unhandled 500 here.
  const payload = (await upstream.json().catch(() => ({
    error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The API did not answer.' },
  }))) as {
    data?: { accessToken: string; admin: unknown; recoveryCodes?: string[] };
  };
  if (!upstream.ok || !payload.data) {
    return NextResponse.json(payload, { status: upstream.status });
  }
  const { accessToken, ...rest } = payload.data;
  const res = NextResponse.json({ data: rest });
  res.cookies.set(
    SESSION_COOKIE,
    accessToken,
    cookieOptions(SESSION_MAX_AGE_SECONDS),
  );
  return res;
}

/** Sign-out: end the server session, drop the cookie. */
export async function DELETE(): Promise<Response> {
  const token = await sessionToken();
  if (token) {
    await fetch(`${apiBaseUrl()}/admin/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return res;
}
