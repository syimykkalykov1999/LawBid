import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NestMiddleware,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { Observable } from 'rxjs';
import { DEMO_HEADER } from '../demo/demo-context';

/**
 * Batch C item 14 (2026-10-24): what a shared cache (CloudFront, a proxy)
 * may keep of an API answer.
 *
 * Rule 1 (CacheSafetyMiddleware, every route): nothing personal is ever
 * shared. A request that carries a credential (Authorization, a cookie, the
 * demo header) never gets `public`; an answer that sets a cookie, a write,
 * and every error is `no-store`; an answer nobody labelled is
 * `private, no-cache` (a browser may keep it but must ask again, the ETag
 * answers 304). `public` answers always carry `Vary: Authorization,
 * Accept-Language`.
 *
 * Rule 2 (@AnonymousCache(seconds), per route, opt-in): the answer to a
 * request WITHOUT credentials is `public, max-age, s-maxage` (the same for
 * every guest); with a credential the same route stays `private, no-cache`.
 * Use it only on a GET that answers every guest identically.
 */
export const ANONYMOUS_CACHE_KEY = 'http:anonymous_cache_seconds';

/** Marks a GET whose answer to a token-less request is the same for every
 * guest, so a CDN may keep it for [seconds] (30–60 is typical). */
export const AnonymousCache = (seconds: number) =>
  SetMetadata(ANONYMOUS_CACHE_KEY, seconds);

/** True when the request is tied to a person or a session. */
export function hasCredentials(req: Pick<Request, 'headers'>): boolean {
  const h = req.headers;
  return Boolean(h.authorization || h.cookie || h[DEMO_HEADER]);
}

const PUBLIC = /(^|[\s,])public(?=[\s,=]|$)/i;

/** Adds [names] to the Vary header without duplicates. */
function addVary(res: Response, names: string[]): void {
  const cur = String(res.getHeader('vary') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const have = new Set(cur.map((v) => v.toLowerCase()));
  for (const n of names) if (!have.has(n.toLowerCase())) cur.push(n);
  res.setHeader('Vary', cur.join(', '));
}

/** The policy of rule 1, applied just before the headers are written. */
export function enforceCacheSafety(
  req: Pick<Request, 'method' | 'headers'>,
  res: Response,
  status: number,
): void {
  const cc = String(res.getHeader('cache-control') ?? '').trim();
  if (status === 304) return;
  if (status >= 400 || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.setHeader('Cache-Control', 'no-store');
    return;
  }
  if (res.getHeader('set-cookie') !== undefined) {
    res.setHeader('Cache-Control', 'private, no-store');
    return;
  }
  if (!cc) {
    res.setHeader('Cache-Control', 'private, no-cache');
    return;
  }
  if (PUBLIC.test(cc)) {
    if (hasCredentials(req)) {
      // Fetched with a credential: keep the browser's freshness, drop the
      // shared-cache permission.
      res.setHeader(
        'Cache-Control',
        cc
          .replace(PUBLIC, '$1private')
          .replace(/(^|,)\s*s-maxage=\d+/i, '$1')
          .replace(/^,\s*|,\s*$/g, '')
          .trim(),
      );
    }
    addVary(res, ['Authorization', 'Accept-Language']);
  }
}

/**
 * Patches `writeHead` so the policy sees the final status and headers of
 * every answer, also those a handler writes itself with `@Res()`.
 */
@Injectable()
export class CacheSafetyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const original = res.writeHead.bind(res) as (...a: unknown[]) => Response;
    res.writeHead = ((status: number, ...rest: unknown[]) => {
      if (!res.headersSent) enforceCacheSafety(req, res, status);
      return original(status, ...rest);
    }) as typeof res.writeHead;
    next();
  }
}

/** Rule 2: sets the shared-cache header for credential-less requests. */
@Injectable()
export class AnonymousCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      const seconds = this.reflector.get<number | undefined>(
        ANONYMOUS_CACHE_KEY,
        ctx.getHandler(),
      );
      if (seconds) {
        const req = ctx.switchToHttp().getRequest<Request>();
        const res = ctx.switchToHttp().getResponse<Response>();
        if (
          (req.method === 'GET' || req.method === 'HEAD') &&
          !hasCredentials(req)
        ) {
          res.setHeader(
            'Cache-Control',
            `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`,
          );
        }
      }
    }
    return next.handle();
  }
}
