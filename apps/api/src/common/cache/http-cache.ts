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

/**
 * ASVS 5.0 V14.3.2 (STAGE2_SECURITY #18): answers with sensitive data —
 * chats, groups, case files and comments, payments, verification, sessions,
 * the data export, the account — get `Cache-Control: private, no-store`, so
 * a browser (the website on a shared computer) never writes them to its disk
 * cache. The ETag stays: the apps send `If-None-Match` from their OWN local
 * copy and still get 304 (the «only changes» rule is untouched; it never
 * relied on the browser's cache). On a controller class or one handler.
 */
export const SENSITIVE_NO_STORE_KEY = 'http:sensitive_no_store';
export const SensitiveNoStore = () => SetMetadata(SENSITIVE_NO_STORE_KEY, true);
const SENSITIVE_LOCAL = 'lawbidSensitiveNoStore';

/** Marks this answer as sensitive (read by enforceCacheSafety). */
export function markSensitive(res: Response): void {
  (res.locals as Record<string, unknown>)[SENSITIVE_LOCAL] = true;
}

/** The iOS / Android apps (headers_interceptor.dart sends X-Platform on
 * every request; the website sends `web`). */
export function isNativeApp(req: Pick<Request, 'headers'>): boolean {
  const raw: unknown = (req.headers as Record<string, unknown> | undefined)?.[
    'x-platform'
  ];
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'ios' || v === 'android';
}

function isSensitive(res: Response): boolean {
  const locals = res.locals as Record<string, unknown> | undefined;
  return locals?.[SENSITIVE_LOCAL] === true;
}

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
const PRIVATE = /(^|[\s,])private(?=[\s,=]|$)/i;

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
  // Review of #1338: no-store only where a BROWSER would write the answer
  // to its disk cache. The phone apps (X-Platform ios / android) keep their
  // own encrypted local copy and revalidate it with If-None-Match; their
  // HTTP cache skips no-store answers (apps/mobile/lib/core/cache/
  // http_cache_interceptor.dart), so no-store there would end ETag/304 and
  // the local-first lists. They keep `private, no-cache` below.
  if (isSensitive(res) && !isNativeApp(req)) {
    res.setHeader('Cache-Control', 'private, no-store');
    addVary(res, ['Authorization', 'X-Platform']);
    return;
  }
  if (isSensitive(res)) addVary(res, ['X-Platform']);
  // Verify batch 13 (E2): a private answer is one account's view. Without
  // `Vary: Authorization` a browser (the web app, a shared computer) kept
  // account A's copy under the URL and revalidated it while signed in as B;
  // the cheap ETags carry the viewer's flags, not who the viewer is, so a
  // matching 304 showed B what A saw. The admin middleware already does
  // this for /admin.
  if (!cc) {
    res.setHeader('Cache-Control', 'private, no-cache');
    addVary(res, ['Authorization']);
    return;
  }
  if (PRIVATE.test(cc)) {
    addVary(res, ['Authorization']);
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
    if (
      ctx.getType() === 'http' &&
      this.reflector.getAllAndOverride<boolean | undefined>(
        SENSITIVE_NO_STORE_KEY,
        [ctx.getHandler(), ctx.getClass()],
      ) === true
    ) {
      markSensitive(ctx.switchToHttp().getResponse<Response>());
    }
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
