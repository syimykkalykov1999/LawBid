import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, apiBaseUrl, cookieOptions } from '@/lib/api/server';

/** The unauthenticated sign-in steps (emailed code, login + password,
 * forgotten-password recovery) — forwarded so the browser only ever talks
 * to this origin. A finished sign-in sets the session cookie here. */
const ALLOWED = new Set([
  'login/start',
  'login/verify',
  'login/password',
  'recover/question',
  'recover/password',
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
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
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
      'user-agent': req.headers.get('user-agent') ?? '',
    },
    body: await req.text(),
    cache: 'no-store',
  });
  // Sign-in without a second step answers with a session: its JWT goes
  // into the httpOnly cookie here and never reaches the browser's JS.
  if (
    upstream.ok &&
    (path === 'login/password' || path === 'login/verify') &&
    (upstream.headers.get('content-type') ?? '').includes('json')
  ) {
    const payload = (await upstream.json()) as {
      data?: { ticket: string | null; session: { accessToken: string; [k: string]: unknown } | null };
    };
    const session = payload.data?.session;
    if (!session) return NextResponse.json(payload, { status: upstream.status });
    const { accessToken, ...rest } = session;
    const res = NextResponse.json({ data: { ticket: null, session: rest } });
    res.cookies.set(SESSION_COOKIE, accessToken, cookieOptions(SESSION_MAX_AGE_SECONDS));
    return res;
  }
  return new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
