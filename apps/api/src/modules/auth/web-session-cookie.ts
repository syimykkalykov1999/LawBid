import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, type Observable, switchMap, map } from 'rxjs';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CorsPolicy } from '../../common/cors/cors-policy';
import { wantsDemo } from '../../common/demo/demo-context';
import type { AppEnv } from '../../config/env.schema';

/**
 * Owner 2026-10-22 (audit #7): the web app's refresh token lives in an
 * HttpOnly cookie instead of the tab's sessionStorage, so a script injected
 * into the page can no longer read a 60-day credential.
 *
 * Opt-in per request: the web client sends `X-LawBid-Web-Session: 1`, and
 * the request must come from an allowed web origin (`web.allowed_origins`;
 * admin origins do not count). CSRF: the custom header forces a CORS
 * preflight, the Origin is checked here, and the cookie is SameSite=Strict
 * and scoped to /api/v1/auth. A demo session never goes into the cookie
 * (the real account stays there while the demo token is parked in the tab).
 */
export const WEB_SESSION_HEADER = 'x-lawbid-web-session';
/**
 * ASVS 5.0 V3.3.1 (STAGE2_SECURITY #1): on https the cookie carries the
 * `__Secure-` prefix, so the browser accepts it only with `Secure` and from a
 * secure origin (a sibling http page cannot plant or overwrite it). `__Host-`
 * is ruled out: it demands `Path=/`, and this cookie is scoped to the auth
 * routes. Plain-http local development keeps the bare name (a prefixed
 * cookie without `Secure` is rejected by the browser).
 */
export const WEB_SESSION_COOKIE = '__Secure-lb_rt';
/** The pre-prefix name. Read for one release so open browser sessions keep
 * working, cleared on the next answer that sets the new one. */
export const LEGACY_WEB_SESSION_COOKIE = 'lb_rt';
export const WEB_SESSION_COOKIE_PATH = '/api/v1/auth';

/** Value of one cookie from a raw `Cookie` header (no cookie-parser). */
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    const raw = part.slice(i + 1).trim();
    try {
      return decodeURIComponent(raw) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** True when the (self-minted) access token carries `demo: true`. */
export function isDemoAccessToken(accessToken: string): boolean {
  const payload = accessToken.split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { demo?: unknown };
    return claims.demo === true;
  } catch {
    return false;
  }
}

@Injectable()
export class WebSessionCookies {
  private readonly cors: CorsPolicy;
  private readonly nodeEnv: AppEnv['NODE_ENV'];

  constructor(
    config: ConfigService,
    @Optional() settings?: AppSettingsService,
    /** Tests inject their own policy. */
    @Optional() cors?: CorsPolicy,
  ) {
    this.nodeEnv = config.get<AppEnv['NODE_ENV']>('NODE_ENV') ?? 'development';
    this.cors =
      cors ??
      new CorsPolicy(
        config
          .get<string>('ADMIN_ORIGINS', '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
        this.nodeEnv,
        () =>
          settings
            ? settings.stringList('web.allowed_origins')
            : Promise.resolve([]),
      );
  }

  /** The web client asked for cookie mode from an allowed web origin, and
   * this is not a demo request. */
  async isWebSession(req: Request): Promise<boolean> {
    if (req.header(WEB_SESSION_HEADER) !== '1') return false;
    if (wantsDemo(req.headers)) return false;
    return (await this.cors.classify(req.header('origin'))) === 'web';
  }

  /** The refresh token from the cookie, only for a web-session request.
   * The prefixed name wins; the legacy name is the one-release migration. */
  async fromRequest(req: Request): Promise<string | null> {
    if (!(await this.isWebSession(req))) return null;
    const header = req.header('cookie');
    return (
      readCookie(header, WEB_SESSION_COOKIE) ??
      readCookie(header, LEGACY_WEB_SESSION_COOKIE)
    );
  }

  set(req: Request, res: Response, refreshToken: string): void {
    const name = this.name(req);
    res.cookie(name, refreshToken, this.options(req));
    // Migration: the browser still holds the old unprefixed cookie; drop it
    // so the two never disagree after the next rotation.
    if (
      name !== LEGACY_WEB_SESSION_COOKIE &&
      readCookie(req.header('cookie'), LEGACY_WEB_SESSION_COOKIE) !== null
    ) {
      this.expire(req, res, LEGACY_WEB_SESSION_COOKIE);
    }
  }

  clear(req: Request, res: Response): void {
    this.expire(req, res, this.name(req));
    if (this.name(req) !== LEGACY_WEB_SESSION_COOKIE) {
      this.expire(req, res, LEGACY_WEB_SESSION_COOKIE);
    }
  }

  private expire(req: Request, res: Response, name: string): void {
    res.cookie(name, '', { ...this.options(req), maxAge: 0 });
  }

  /** `__Secure-` needs `Secure`; plain-http dev keeps the bare name. */
  private name(req: Request): string {
    return this.secure(req) ? WEB_SESSION_COOKIE : LEGACY_WEB_SESSION_COOKIE;
  }

  private secure(req: Request): boolean {
    return (
      this.nodeEnv === 'production' || this.nodeEnv === 'staging' || req.secure
    );
  }

  private options(req: Request) {
    return {
      httpOnly: true,
      secure: this.secure(req),
      sameSite: 'strict' as const,
      path: WEB_SESSION_COOKIE_PATH,
      // No maxAge: a browser-session cookie, like the sessionStorage it
      // replaces (closing the browser signs the website out).
    };
  }
}

const CLEARS_COOKIE = 'auth:clearsWebSessionCookie';

/** logout / logout-all: the cookie goes with the session. */
export const ClearsWebSessionCookie = () => SetMetadata(CLEARS_COOKIE, true);

type TokenPair = { accessToken: string; refreshToken: string };

function isTokenPair(v: unknown): v is TokenPair {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.accessToken === 'string' &&
    typeof o.refreshToken === 'string' &&
    o.refreshToken.length > 0
  );
}

/**
 * On the auth routes: a web-session request gets its refresh token as the
 * cookie and `refreshToken: ''` in the body (the contract is unchanged).
 */
@Injectable()
export class WebSessionCookieInterceptor implements NestInterceptor {
  constructor(
    private readonly cookies: WebSessionCookies,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const clears = this.reflector.get<boolean>(CLEARS_COOKIE, ctx.getHandler());
    return from(this.cookies.isWebSession(req)).pipe(
      switchMap((web) =>
        next.handle().pipe(
          map((body: unknown) => {
            if (!web) return body;
            if (clears) {
              this.cookies.clear(req, res);
              return body;
            }
            if (!isTokenPair(body) || isDemoAccessToken(body.accessToken)) {
              return body;
            }
            this.cookies.set(req, res, body.refreshToken);
            return { ...body, refreshToken: '' };
          }),
        ),
      ),
    );
  }
}
