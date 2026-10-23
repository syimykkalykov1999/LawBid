import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  apiBaseUrl,
  cookieOptions,
  sessionToken,
} from '@/lib/api/server';

/** The API's own request timeout is REQUEST_TIMEOUT_MS (default 30 s);
 * 120 s covers the slow admin exports and still ends a hung call. */
const UPSTREAM_TIMEOUT_MS = 120_000;

/**
 * Forwards `/api/proxy/<path>` to `${API_BASE_URL}/admin/<path>` with the
 * admin JWT from the httpOnly cookie. Only `/admin/*` is reachable this
 * way. A 401 (idle timeout, revoked, expired) also clears the cookie so
 * the client lands on /login.
 */
async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const token = await sessionToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No admin session.' } },
      { status: 401 },
    );
  }
  // Security review: dot segments would let `new URL` escape `/admin/`.
  if (path.some((s) => s === '.' || s === '..' || s === '')) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  const url = new URL(
    `${apiBaseUrl()}/admin/${path.map(encodeURIComponent).join('/')}`,
  );
  url.search = req.nextUrl.search;
  const headers = new Headers();
  headers.set('authorization', `Bearer ${token}`);
  for (const h of ['content-type', 'x-justification', 'idempotency-key', 'accept', 'x-admin-country']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Scale audit 2026-10-23: without a deadline one hung API call keeps the
  // panel's server (and its memory) busy for ever; exports are the slowest
  // answers, so the deadline is generous but finite.
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body:
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : await req.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return NextResponse.json(
        { error: { code: 'UPSTREAM_TIMEOUT', message: 'The API did not answer in time.' } },
        { status: 504 },
      );
    }
    throw e;
  }
  const passthrough = new Headers({
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  });
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) passthrough.set('content-disposition', disposition);
  const res = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: passthrough,
  });
  if (upstream.status === 401) {
    res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  }
  return res;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
