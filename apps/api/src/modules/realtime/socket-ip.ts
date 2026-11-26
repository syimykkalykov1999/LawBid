import {
  forwardedClientIp,
  trustedHopsFor,
} from '../../common/net/edge-client-ip';

/**
 * Owner 2026-10-25: the caller's address for a socket handshake, honouring
 * the same `TRUST_PROXY_HOPS` the HTTP side uses (Express `trust proxy`):
 * with N trusted proxies the address is the Nth entry from the right of
 * X-Forwarded-For; with 0 it is the socket's own peer address. Anything a
 * client puts further left in the header is ignored.
 * G1: a handshake that came through the API edge (x-origin-verify holds
 * `edgeSecret`) trusts one more hop (CloudFront), like the HTTP side
 * (common/net/edge-client-ip.ts).
 */
export function socketClientIp(
  headers: Record<string, string | string[] | undefined>,
  peer: string | undefined,
  trustedHops: number,
  edgeSecret = '',
): string | undefined {
  const hit = forwardedClientIp(
    headers,
    trustedHopsFor(headers, trustedHops, edgeSecret),
  );
  return hit ?? peer;
}
