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
export const WEB_SESSION_COOKIE = 'lb_rt';
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

  /** The refresh token from the cookie, only for a web-session request. */
  async fromRequest(req: Request): Promise<string | null> {
    if (!(await this.isWebSession(req))) return null;
    return readCookie(req.header('cookie'), WEB_SESSION_COOKIE);
  }

  set(req: Request, res: Response, refreshToken: string): void {
    res.cookie(WEB_SESSION_COOKIE, refreshToken, this.options(req));
  }

  clear(req: Request, res: Response): void {
    res.cookie(WEB_SESSION_COOKIE, '', { ...this.options(req), maxAge: 0 });
  }

  private options(req: Request) {
    return {
      httpOnly: true,
      secure:
        this.nodeEnv === 'production' ||
        this.nodeEnv === 'staging' ||
        req.secure,
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
