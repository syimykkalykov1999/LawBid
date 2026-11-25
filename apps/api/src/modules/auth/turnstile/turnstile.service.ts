import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { SecretsService } from '../../../common/secrets/secrets.service';

export const TURNSTILE_HEADER = 'x-turnstile-token';
export const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Cloudflare: a token is at most 2048 characters. */
export const TURNSTILE_TOKEN_MAX = 2048;
/** Cloudflare's own example waits 10 s; a sign-in screen should not. */
export const TURNSTILE_TIMEOUT_MS = 5_000;
/** One try plus one retry with the same idempotency key (item 13). */
export const TURNSTILE_ATTEMPTS = 2;

export type TurnstileVerdict =
  /** Cloudflare accepted the token (and host / action matched). */
  | 'valid'
  /** Missing, malformed, expired, reused, wrong host or wrong action. */
  | 'invalid'
  /** No secret key saved in Интеграции. */
  | 'unconfigured'
  /** Cloudflare did not answer in time / answered garbage / our key is bad. */
  | 'unavailable';

export interface TurnstileResult {
  verdict: TurnstileVerdict;
  hostname?: string;
  action?: string;
  reason?: string;
}

interface SiteverifyBody {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  'error-codes'?: unknown;
}

/**
 * 2026-10-24 (abuse batch B, item 4): server side of Cloudflare Turnstile
 * (free; web only: there is no native mobile SDK, the app uses App Check).
 * POSTs the page's token to siteverify with a timeout. A token is
 * single-use and lives 5 minutes. The secret key and the optional list of
 * allowed hostnames come from Интеграции → Cloudflare Turnstile
 * (provider-registry `turnstile`). The decision (log / block) is the
 * AppCheckGuard's, by `security.turnstile.mode`.
 * Source: developers.cloudflare.com/turnstile/get-started/server-side-
 * validation (updated 2026-10-22).
 */
@Injectable()
export class TurnstileService {
  constructor(
    private readonly secrets: SecretsService,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(TurnstileService.name);
  }

  /** Holes re-check (25.11): both keys saved in Интеграции → Cloudflare
   * Turnstile (the site key the page renders the widget with, the secret
   * key siteverify needs). Without both the website has no Turnstile proof
   * to offer, so «Авто» stays off and nothing is enforced on it by it. */
  async configured(): Promise<boolean> {
    try {
      const [site, secret] = await Promise.all([
        this.secrets.field('turnstile', 'siteKey'),
        this.secrets.field('turnstile', 'secretKey'),
      ]);
      return Boolean(site) && Boolean(secret);
    } catch {
      return false;
    }
  }

  async verify(
    token: string | undefined,
    opts: { ip?: string; expectedAction?: string } = {},
  ): Promise<TurnstileResult> {
    const secret = await this.secrets.field('turnstile', 'secretKey');
    if (!secret) return { verdict: 'unconfigured' };
    if (!token) return { verdict: 'invalid', reason: 'missing-input-response' };
    if (token.length > TURNSTILE_TOKEN_MAX) {
      return { verdict: 'invalid', reason: 'token-too-long' };
    }
    const body = new URLSearchParams({ secret, response: token });
    if (opts.ip) body.set('remoteip', opts.ip);
    // Item 13 (L3): Cloudflare's documented safe retry — one UUID per
    // validation, reused on the retry, so a retried check is not taken for
    // a reused token (server-side-validation, updated 2026-11-16).
    body.set('idempotency_key', randomUUID());
    const timeoutMs = await this.timeoutMs();
    let json: SiteverifyBody | undefined;
    let failure: TurnstileResult | undefined;
    for (let attempt = 0; attempt < TURNSTILE_ATTEMPTS; attempt++) {
      const out = await this.siteverify(body, timeoutMs);
      if ('json' in out) {
        json = out.json;
        failure = undefined;
        break;
      }
      failure = out.failure;
      // Only a network failure or timeout is worth a second try; an HTTP
      // answer from Cloudflare is final.
      if (failure.reason?.startsWith('http-')) break;
    }
    if (!json) {
      return failure ?? { verdict: 'unavailable', reason: 'network' };
    }
    const hostname =
      typeof json.hostname === 'string' ? json.hostname : undefined;
    const action = typeof json.action === 'string' ? json.action : undefined;
    if (json.success !== true) {
      const codes = Array.isArray(json['error-codes'])
        ? (json['error-codes'] as unknown[]).filter(
            (c): c is string => typeof c === 'string',
          )
        : [];
      // A wrong / missing secret is our setup problem, not the visitor's.
      if (
        codes.includes('invalid-input-secret') ||
        codes.includes('missing-input-secret')
      ) {
        this.logger.error(
          { codes },
          'Turnstile secret key rejected by Cloudflare (Интеграции → Cloudflare Turnstile)',
        );
        return { verdict: 'unavailable', reason: 'bad-secret' };
      }
      return {
        verdict: 'invalid',
        hostname,
        action,
        reason: codes.join(',').slice(0, 120) || 'failed',
      };
    }
    const hosts = ((await this.secrets.field('turnstile', 'hostnames')) ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (hosts.length > 0 && !hosts.includes((hostname ?? '').toLowerCase())) {
      return {
        verdict: 'invalid',
        hostname,
        action,
        reason: 'hostname-mismatch',
      };
    }
    // Item 13: an older page renders the widget without an action; only a
    // token that names a DIFFERENT form is refused.
    if (opts.expectedAction && action && action !== opts.expectedAction) {
      return {
        verdict: 'invalid',
        hostname,
        action,
        reason: 'action-mismatch',
      };
    }
    return { verdict: 'valid', hostname, action };
  }

  private async siteverify(
    body: URLSearchParams,
    timeoutMs: number,
  ): Promise<{ json: SiteverifyBody } | { failure: TurnstileResult }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        return {
          failure: { verdict: 'unavailable', reason: `http-${res.status}` },
        };
      }
      return { json: (await res.json()) as SiteverifyBody };
    } catch (err) {
      this.logger.warn({ err }, 'Turnstile siteverify failed');
      return {
        failure: {
          verdict: 'unavailable',
          reason:
            err instanceof Error && err.name === 'AbortError'
              ? 'timeout'
              : 'network',
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** `security.turnstile.timeout_ms` (admin), 500–10 000; the built-in 5 s
   * when the setting cannot be read. */
  private async timeoutMs(): Promise<number> {
    try {
      const n = await this.settings?.number('security.turnstile.timeout_ms');
      if (typeof n === 'number' && Number.isFinite(n)) {
        return Math.min(10_000, Math.max(500, Math.floor(n)));
      }
    } catch {
      // the default below
    }
    return TURNSTILE_TIMEOUT_MS;
  }
}
