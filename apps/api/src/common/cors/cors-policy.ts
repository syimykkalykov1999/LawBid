import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';
import type { AppEnv } from '../../config/env.schema';

/** Origins re-read from app_config at most this often (the admin edits
 * `web.allowed_origins`; preflights shouldn't each cost a Redis read). */
const WEB_ORIGINS_CACHE_MS = 30_000;

const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
const LOCALHOST_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export type OriginKind = 'admin' | 'web' | null;

/** Lower-cased, no trailing slash; null for anything that isn't a plain
 * scheme://host[:port] origin (a `*` typed into the admin is ignored). */
export function normalizeOrigin(raw: string): string | null {
  const o = raw.trim().toLowerCase().replace(/\/+$/, '');
  return ORIGIN_RE.test(o) ? o : null;
}

/**
 * docs/06 §4.1 CORS, extended for the future web client. Two kinds of
 * browser origin may call the API:
 * - the admin panel (`ADMIN_ORIGINS` env) — with credentials, as before;
 * - the client web app (`web.allowed_origins` in app_config, editable in
 *   the admin) — no credentials: auth is a Bearer token, never a cookie.
 * Outside production any http://localhost / 127.0.0.1 port counts as a
 * web origin, for local development. The mobile app sends no Origin and
 * is unaffected; any other origin gets no CORS headers.
 */
export class CorsPolicy {
  private readonly admin: Set<string>;
  private cache: { at: number; origins: Set<string> } | null = null;

  constructor(
    adminOrigins: string[],
    private readonly nodeEnv: AppEnv['NODE_ENV'],
    private readonly loadWebOrigins: () => Promise<string[]>,
    private readonly now: () => number = Date.now,
  ) {
    this.admin = new Set(
      adminOrigins.map(normalizeOrigin).filter((o): o is string => !!o),
    );
  }

  async classify(origin: string | undefined): Promise<OriginKind> {
    if (!origin) return null;
    const o = normalizeOrigin(origin);
    if (!o) return null;
    if (this.admin.has(o)) return 'admin';
    if (this.nodeEnv !== 'production' && LOCALHOST_RE.test(o)) return 'web';
    return (await this.webOrigins()).has(o) ? 'web' : null;
  }

  private async webOrigins(): Promise<Set<string>> {
    const t = this.now();
    if (this.cache && t - this.cache.at < WEB_ORIGINS_CACHE_MS) {
      return this.cache.origins;
    }
    let raw: string[];
    try {
      raw = await this.loadWebOrigins();
    } catch {
      // Redis/DB hiccup: keep the last known list rather than failing open
      // or dropping every web request.
      return this.cache?.origins ?? new Set();
    }
    const origins = new Set(
      raw
        .map(normalizeOrigin)
        .filter((o): o is string => !!o)
        // Production web origins must be https.
        .filter((o) => this.nodeEnv !== 'production' || o.startsWith('https:')),
    );
    this.cache = { at: t, origins };
    return origins;
  }

  /** Per-request options for `app.enableCors(delegate)`. */
  delegate(
    base: CorsOptions,
  ): (
    req: Request,
    cb: (err: Error | null, options: CorsOptions) => void,
  ) => void {
    return (req, cb) => {
      this.classify(req.header('origin')).then(
        (kind) =>
          cb(null, {
            ...base,
            origin: kind !== null,
            credentials: kind === 'admin',
          }),
        () => cb(null, { ...base, origin: false }),
      );
    };
  }
}
