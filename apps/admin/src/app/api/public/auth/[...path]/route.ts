import { NextResponse, type NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/api/server';

/** The two unauthenticated sign-in steps (login/start, login/verify) —
 * forwarded so the browser only ever talks to this origin. */
const ALLOWED = new Set(['login/start', 'login/verify']);

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
