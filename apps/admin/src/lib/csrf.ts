/**
 * Owner 2026-10-25 (S18-5): SameSite=Strict is only defense in depth — a
 * sibling subdomain is "same-site". Every state-changing call must also come
 * from this very origin (Fetch Metadata, with the Origin header as fallback),
 * and a body must be JSON or a multipart upload, never a CORS-"simple"
 * text/plain or urlencoded form.
 */
const BODY_TYPES = ['application/json', 'multipart/form-data'];

export function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

/** Returns a reason when the request must be refused, else null. */
export function crossSiteReason(req: Request): string | null {
  if (isSafeMethod(req.method)) return null;
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' ? null : `sec-fetch-site=${site}`;
  // Old browsers / non-browser clients: fall back to Origin vs Host.
  const origin = req.headers.get('origin');
  if (!origin) return null;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host ? null : 'origin-mismatch';
  } catch {
    return 'origin-invalid';
  }
}

/** True when a request that carries a body has an accepted content type. */
export function bodyTypeAllowed(req: Request): boolean {
  if (isSafeMethod(req.method)) return true;
  const len = req.headers.get('content-length');
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!type) return len === null || len === '0';
  return BODY_TYPES.some((t) => type.startsWith(t));
}

/** Right-most entry of x-forwarded-for: the one our own load balancer
 * appended. Everything left of it is client-supplied and spoofable (S18-7). */
export function lastForwardedFor(header: string | null): string {
  if (!header) return '';
  const parts = header.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
