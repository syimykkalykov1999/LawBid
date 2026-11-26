import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/**
 * G1 (API edge, infra/modules/api-edge): CloudFront in front of the ALB.
 *
 * CloudFront appends the viewer address to X-Forwarded-For and the ALB then
 * appends CloudFront's, so behind the edge the real client is one entry
 * further left than `TRUST_PROXY_HOPS` (the ALB only) says. Trusting that
 * extra hop for EVERY request would let a direct caller (DNS not yet moved,
 * or the origin lock off) write its own address into the header; trusting it
 * for none makes a whole city behind one edge node share every per-IP limit.
 *
 * So the extra hop is trusted per request, only when `x-origin-verify` holds
 * the edge secret: CloudFront sets that header on every origin request and
 * overwrites one a viewer sends (AWS «Restricting access to Application Load
 * Balancers»). Same rule as Express `trust proxy` with a hop count, plus one.
 */
export const EDGE_VERIFY_HEADER = 'x-origin-verify';

type Headers = Record<string, string | string[] | undefined>;

/** True only for a request that came through our CloudFront edge. */
export function fromApiEdge(headers: Headers, secret: string): boolean {
  if (!secret) return false;
  const raw = headers[EDGE_VERIFY_HEADER];
  // CloudFront sends exactly one; anything else is not the edge.
  if (typeof raw !== 'string') return false;
  const got = Buffer.from(raw);
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * The client address with `trustedHops` proxies in front (Express
 * `trust proxy` semantics: the Nth X-Forwarded-For entry from the right; the
 * leftmost one when the header is shorter). Undefined without a header.
 */
export function forwardedClientIp(
  headers: Headers,
  trustedHops: number,
): string | undefined {
  if (trustedHops <= 0) return undefined;
  const raw = headers['x-forwarded-for'];
  const joined = Array.isArray(raw) ? raw.join(',') : raw;
  const parts = (joined ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[Math.max(0, parts.length - trustedHops)];
}

/** Hops to trust for this request: the ALB ones, plus CloudFront when verified. */
export function trustedHopsFor(
  headers: Headers,
  trustedHops: number,
  edgeSecret: string,
): number {
  return trustedHops > 0 && fromApiEdge(headers, edgeSecret)
    ? trustedHops + 1
    : trustedHops;
}

/**
 * Express middleware: for a verified edge request `req.ip` becomes the
 * viewer's address, so every per-IP limit (ThrottlerGuard, OTP and auth
 * limits, /app-events), Turnstile `remoteip` and App Check see the real
 * client in every step of the edge rollout. Other requests keep Express's
 * own req.ip (`trust proxy` = TRUST_PROXY_HOPS).
 */
export function apiEdgeClientIp(edgeSecret: string, trustedHops: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (trustedHops > 0 && fromApiEdge(req.headers, edgeSecret)) {
      const ip = forwardedClientIp(req.headers, trustedHops + 1);
      if (ip && isIP(ip)) {
        Object.defineProperty(req, 'ip', {
          value: ip,
          configurable: true,
          enumerable: true,
        });
      }
    }
    next();
  };
}
