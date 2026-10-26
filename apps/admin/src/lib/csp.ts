/**
 * Audit #8 (2026-10-22): the admin's Content-Security-Policy, built per
 * request with a fresh nonce (Next.js "Content Security Policy" guide).
 * Scripts run only with the nonce ('strict-dynamic' lets them load their
 * own chunks); no 'unsafe-inline' scripts in production.
 *
 * connect-src is 'self' (every API call goes through /api/proxy) plus the
 * origins in ADMIN_CONNECT_SRC — the S3 buckets the presigned uploads POST
 * to (stickers, gifts, documents, support files) and the media CDN — and
 * Sentry's ingest hosts (browser error reports, DSN set in the admin).
 */
export const SENTRY_CONNECT_SRC = ['https://*.ingest.sentry.io', 'https://*.ingest.us.sentry.io', 'https://*.ingest.de.sentry.io'];

/** "https://a, https://b" / space separated → valid origins only. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https:\/\/[a-z0-9.*-]+(:\d+)?$/i.test(s) || /^http:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
}

export function buildCsp(opts: { nonce: string; dev: boolean; connectSrc?: string }): string {
  const { nonce, dev } = opts;
  const connect = ["'self'", ...parseOrigins(opts.connectSrc), ...SENTRY_CONNECT_SRC];
  // Outside production http:/ws: are allowed too: on a phone in the same
  // Wi-Fi the local storage (MinIO) answers at http://<mac-ip>:9000, and
  // `next dev` needs eval + its websocket for react-refresh.
  if (dev) connect.push('http:', 'ws:');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${dev ? ' http:' : ''}`,
    // Reels play from signed Bunny/S3 links.
    `media-src 'self' https: blob:${dev ? ' http:' : ''}`,
    `connect-src ${connect.join(' ')}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** 128 random bits, base64 — fine for edge (no Buffer). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
