import { NextResponse, type NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/api/server';

/** The unauthenticated sign-in steps (emailed code, login + password,
 * forgotten-password recovery) — forwarded so the browser only ever talks
 * to this origin. */
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
  return new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
