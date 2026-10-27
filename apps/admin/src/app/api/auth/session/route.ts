import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  apiBaseUrl,
  cookieOptions,
  sessionToken,
} from '@/lib/api/server';
import { crossSiteReason, lastForwardedFor } from '@/lib/csrf';

/**
 * The second sign-in step runs here, not in the browser (owner 2026-10-22:
 * it is mandatory for every admin): the authenticator code, a recovery
 * code, the first code of the forced authenticator setup, or the passkey
 * assertion is forwarded to the API, and the returned admin JWT goes
 * straight into the httpOnly cookie. The response passes the rest through (admin; after the setup
 * also the ten recovery codes, shown once).
 */
export async function POST(req: Request): Promise<Response> {
  if (crossSiteReason(req)) return forbiddenOrigin();
  const body = (await req.json()) as {
    ticket: string;
    code?: string;
    recoveryCode?: string;
    setupCode?: string;
    /** Owner 2026-10-22: the passkey assertion instead of a code. */
    passkey?: { challengeId: string; response: Record<string, unknown> };
  };
  const [path, sent] = body.passkey
    ? [
        '/admin/auth/login/passkey',
        { ticket: body.ticket, challengeId: body.passkey.challengeId, response: body.passkey.response },
      ]
    : body.setupCode
      ? ['/admin/auth/login/totp-confirm', { ticket: body.ticket, code: body.setupCode }]
      : body.recoveryCode
        ? ['/admin/auth/recovery', { ticket: body.ticket, recoveryCode: body.recoveryCode }]
        : ['/admin/auth/totp', { ticket: body.ticket, code: body.code }];
  const upstream = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': lastForwardedFor(req.headers.get('x-forwarded-for')),
      'user-agent': req.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify(sent),
    cache: 'no-store',
  });
  // A non-JSON upstream answer (ALB 502, gateway timeout) must not turn
  // into an unhandled 500 here.
  const payload = (await upstream.json().catch(() => ({
    error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The API did not answer.' },
  }))) as {
    data?:
      | { accessToken: string; admin: unknown }
      | { recoveryCodes: string[]; session: { accessToken: string; admin: unknown } };
  };
  if (!upstream.ok || !payload.data) {
    return NextResponse.json(payload, { status: upstream.status });
  }
  const data = payload.data;
  const session = 'session' in data ? data.session : data;
  const { accessToken, ...rest } = session;
  const res = NextResponse.json({
    data: 'recoveryCodes' in data ? { ...rest, recoveryCodes: data.recoveryCodes } : rest,
  });
  res.cookies.set(
    SESSION_COOKIE,
    accessToken,
    cookieOptions(SESSION_MAX_AGE_SECONDS),
  );
  return res;
}

/** Sign-out: end the server session, drop the cookie. */
export async function DELETE(req: Request): Promise<Response> {
  if (crossSiteReason(req)) return forbiddenOrigin();
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

function forbiddenOrigin(): Response {
  return NextResponse.json(
    { error: { code: 'FORBIDDEN', message: 'Cross-site request refused.' } },
    { status: 403 },
  );
}
