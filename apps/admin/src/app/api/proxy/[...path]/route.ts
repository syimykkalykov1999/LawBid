import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  apiBaseUrl,
  cookieOptions,
  sessionToken,
} from '@/lib/api/server';
import { bodyTypeAllowed, crossSiteReason, isSafeMethod } from '@/lib/csrf';

/** How long the API may take to start answering. */
const UPSTREAM_TIMEOUT_MS = 120_000;
const RETRY_AFTER_SEC = 2;
/** S18-6: no request body bigger than this goes through the panel. */
const MAX_BODY_BYTES = 25 * 1024 * 1024;

function refuse(status: number, code: string, message: string): Response {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Passes the body through as a stream and fails it past the cap, so a
 * chunked upload without Content-Length cannot fill the panel's memory. */
function cappedStream(
  body: ReadableStream<Uint8Array>,
  state: { tooLarge: boolean },
): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_BODY_BYTES) {
          state.tooLarge = true;
          controller.error(new Error('BODY_TOO_LARGE'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/** One structured line per failed upstream call (S18-4); no body, no token. */
function logUpstreamFailure(req: NextRequest, path: string[], status: number, code: string): void {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'admin_proxy_upstream_failure',
      status,
      code,
      method: req.method,
      path: `/admin/${path.join('/')}`,
    }),
  );
}

/**
 * Forwards `/api/proxy/<path>` to `${API_BASE_URL}/admin/<path>` with the
 * admin JWT from the httpOnly cookie. Only `/admin/*` is reachable this
 * way. A 401 (idle timeout, revoked, expired) also clears the cookie so
 * the client lands on /login.
 */
async function forward(req: NextRequest, path: string[]): Promise<Response> {
  // S18-5: a state-changing call must come from this very origin and carry
  // JSON or a multipart upload (never a CORS-"simple" text/plain form).
  if (crossSiteReason(req)) {
    return refuse(403, 'FORBIDDEN', 'Cross-site request refused.');
  }
  if (!bodyTypeAllowed(req)) {
    return refuse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON or a multipart upload.');
  }
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (!isSafeMethod(req.method) && declared > MAX_BODY_BYTES) {
    return refuse(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  }
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
  for (const h of ['content-type', 'x-justification', 'x-reason-code', 'idempotency-key', 'accept', 'x-admin-country', 'x-background']) {
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
  const capState = { tooLarge: false };
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body:
        isSafeMethod(req.method) || !req.body
          ? undefined
          : cappedStream(req.body, capState),
      // Streams the upload instead of buffering it (S18-6).
      ...(isSafeMethod(req.method) || !req.body ? {} : { duplex: 'half' as const }),
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (e) {
    // Our own deadline, or a TimeoutError from the runtime's fetch.
    const timeout =
      timedOut || (e instanceof Error && e.name === 'TimeoutError');
    if (capState.tooLarge) {
      return refuse(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
    }
    logUpstreamFailure(req, path, timeout ? 504 : 502, timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE');
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
  if (upstream.status >= 502 && upstream.status <= 504) {
    logUpstreamFailure(req, path, upstream.status, 'UPSTREAM_BAD_STATUS');
  }
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
