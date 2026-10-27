import { NextResponse, type NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/api/server';
import { crossSiteReason, lastForwardedFor } from '@/lib/csrf';

/** The unauthenticated sign-in steps (login + password, the forced
 * authenticator setup's QR step, forgotten-password recovery) — forwarded
 * so the browser only ever talks to this origin. None of them returns a
 * session: the steps that do (authenticator code, recovery code, the end
 * of the setup) run through app/api/auth/session, which sets the cookie. */
const ALLOWED = new Set([
  'login/password',
  // Owner 2026-10-22: the forced first setup of the authenticator.
  'login/totp-setup',
  // Owner 2026-10-22: step 2 with a passkey — the options only; the
  // assertion itself goes through app/api/auth/session (it sets the cookie).
  'login/passkey/options',
  'recover/question',
  'recover/password',
  // Owner 2026-10-16: the invited admin picks a login and password.
  'invite/accept',
]);

/** `GET invite/<token>`: who the link is for. */
const INVITE_PREVIEW = /^invite\/[A-Za-z0-9_-]{20,128}$/;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const path = (await ctx.params).path.join('/');
  if (!INVITE_PREVIEW.test(path)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Not found.' } },
      { status: 404 },
    );
  }
  const upstream = await fetch(`${apiBaseUrl()}/admin/auth/${path}`, {
    headers: {
      accept: 'application/json',
      'x-forwarded-for': lastForwardedFor(req.headers.get('x-forwarded-for')),
    },
    cache: 'no-store',
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (crossSiteReason(req)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Cross-site request refused.' } },
      { status: 403 },
    );
  }
  const path = (await ctx.params).path.join('/');
  if (!ALLOWED.has(path)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Not found.' } },
      { status: 404 },
    );
  }
  const upstream = await fetch(`${apiBaseUrl()}/admin/auth/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': lastForwardedFor(req.headers.get('x-forwarded-for')),
      'user-agent': req.headers.get('user-agent') ?? '',
    },
    body: await req.text(),
    cache: 'no-store',
  });
  return new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
