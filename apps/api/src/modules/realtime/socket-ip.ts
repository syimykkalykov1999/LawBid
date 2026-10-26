/**
 * Owner 2026-10-25: the caller's address for a socket handshake, honouring
 * the same `TRUST_PROXY_HOPS` the HTTP side uses (Express `trust proxy`):
 * with N trusted proxies the address is the Nth entry from the right of
 * X-Forwarded-For; with 0 it is the socket's own peer address. Anything a
 * client puts further left in the header is ignored.
 */
export function socketClientIp(
  headers: Record<string, string | string[] | undefined>,
  peer: string | undefined,
  trustedHops: number,
): string | undefined {
  if (trustedHops > 0) {
    const raw = headers['x-forwarded-for'];
    const joined = Array.isArray(raw) ? raw.join(',') : raw;
    const parts = (joined ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const hit = parts[Math.max(0, parts.length - trustedHops)];
    if (hit) return hit;
  }
  return peer;
}
