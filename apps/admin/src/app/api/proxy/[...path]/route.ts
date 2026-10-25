import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  apiBaseUrl,
  cookieOptions,
  sessionToken,
} from '@/lib/api/server';

/** How long the API may take to start answering. */
const UPSTREAM_TIMEOUT_MS = 120_000;
const RETRY_AFTER_SEC = 2;

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
  for (const h of ['content-type', 'x-justification', 'x-reason-code', 'idempotency-key', 'accept', 'x-admin-country']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Owner 2026-10-23 ("связь пропала"): an API that restarts or hangs must
  // reach the browser as a clear JSON 502/504 the client can retry, never
  // as Next's HTML 500. The timer covers the wait for the response head;
  // a long download (export) streams on after it.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);
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
      signal: controller.signal,
    });
  } catch (e) {
    // Our own deadline, or a TimeoutError from the runtime's fetch.
    const timeout =
      timedOut || (e instanceof Error && e.name === 'TimeoutError');
    return NextResponse.json(
      timeout
        ? {
            error: {
              code: 'UPSTREAM_TIMEOUT',
              message: 'The server did not answer in time.',
            },
          }
        : {
            error: {
              code: 'UPSTREAM_UNAVAILABLE',
              message: 'The server is not reachable right now.',
            },
          },
      {
        status: timeout ? 504 : 502,
        headers: { 'retry-after': String(RETRY_AFTER_SEC) },
      },
    );
  } finally {
    clearTimeout(timer);
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
