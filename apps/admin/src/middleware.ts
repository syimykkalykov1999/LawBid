import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, newNonce } from '@/lib/csp';

const SESSION_COOKIE = 'lawbid_admin';

/** Cheap gate: no session cookie → /login. The real check (signature,
 * Redis session, role) is the API's on every proxied call.
 *
 * Audit #8: every page response also gets a per-request nonce CSP
 * (lib/csp.ts). The nonce reaches the app as the `x-nonce` request header;
 * Next.js puts it on its own scripts, the root layout on the theme script. */
export function middleware(req: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV !== 'production',
    connectSrc: process.env.ADMIN_CONNECT_SRC,
  });
  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;
  const pass = () => {
    const headers = new Headers(req.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
    return withCsp(NextResponse.next({ request: { headers } }));
  };
  // Owner 2026-10-16: an invited admin opens the link before any session.
  if (pathname.startsWith('/invite/')) return pass();
  if (pathname.startsWith('/login')) {
    if (hasSession) return withCsp(NextResponse.redirect(new URL('/', req.url)));
    return pass();
  }
  if (!hasSession) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return withCsp(NextResponse.redirect(url));
  }
  return pass();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
