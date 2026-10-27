import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { TokenService } from '../services/token.service';
import { AuthChallengeService } from '../services/auth-challenge.service';
import {
  TURNSTILE_HEADER,
  TurnstileService,
} from '../turnstile/turnstile.service';
import {
  APP_CHECK_HEADER,
  AppCheckService,
  type AppCheckVerdict,
} from './app-check.service';

export const APP_CHECK_MODES = ['off', 'monitor', 'enforce'] as const;
export type AppCheckMode = (typeof APP_CHECK_MODES)[number];

export interface AppCheckOptions {
  /** With `enforce`, a request whose body satisfies this still passes
   * without a token: a code by e-mail costs nothing, so a browser or an
   * old app build keeps that way in while SMS (money) stays behind App
   * Check. */
  freeWhen?: (body: Record<string, unknown>) => boolean;
  /** S14-7: with `enforce` and `security.app_check.replay_protection`, a
   * request whose body satisfies this CONSUMES its token (a captured token
   * cannot be replayed). Meant for the low-volume, costly routes only. */
  consumeWhen?: (body: Record<string, unknown>) => boolean;
  /** S14-13: the route is only guarded once the caller (this account or
   * this address) has failed `security.auth_challenge_after_failures`
   * times; the happy path never needs a token. The kind picks how the
   * account is read from the body. */
  challenge?: 'password' | 'otp';
}

export const APP_CHECK_KEY = 'app-check:required';

/**
 * Marks a public, costly route (sends an SMS / e-mail, answers "is this
 * number registered") as one that should carry the app's App Check token.
 * What happens without one is `security.app_check.mode` (admin Система →
 * Настройки): off / monitor (log only, the default) / enforce (403
 * DEVICE_ATTESTATION_REQUIRED).
 */
export const RequireAppCheck = (options: AppCheckOptions = {}) =>
  SetMetadata(APP_CHECK_KEY, options);

/** Parses the admin setting; anything unexpected is treated as monitor. */
export function parseAppCheckMode(raw: string): AppCheckMode {
  return (APP_CHECK_MODES as readonly string[]).includes(raw)
    ? (raw as AppCheckMode)
    : 'monitor';
}

/**
 * Security research #5 (2026-10-22), A4 — the server side of Firebase App
 * Check on the costly anonymous routes (the app side is B1:
 * `X-Firebase-AppCheck` on the same requests). The verdict of every
 * request is logged (`metric: app_check`) so the share of requests
 * without a token can be watched for a week in monitor mode before
 * enforce is switched on — an old app build in the wild is then a known
 * number, not a surprise.
 *
 * A caller with a valid access token is exempt: a signed-in person may
 * only ask a code for their OWN number (AuthController.requestOtp), which
 * is not pumping. With no Firebase project configured yet the guard
 * cannot verify anything and lets the request through with an error log
 * (never a silent lock-out of every user).
 */
@Injectable()
export class AppCheckGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: AppSettingsService,
    private readonly appCheck: AppCheckService,
    private readonly tokens: TokenService,
    private readonly logger: PinoLogger,
    // 2026-10-24 (abuse batch B, item 4): the website's Turnstile token.
    @Optional() private readonly turnstile?: TurnstileService,
    // 2026-10-25 (S14-13): challenge after repeated failures.
    @Optional() private readonly challenge?: AuthChallengeService,
  ) {
    this.logger.setContext(AppCheckGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<
      AppCheckOptions | undefined
    >(APP_CHECK_KEY, [context.getHandler(), context.getClass()]);
    if (!options) return true;
    const req = context.switchToHttp().getRequest<Request>();
    let mode = await this.mode();
    let tsMode = await this.turnstileMode();
    if (options.challenge) {
      // Only a caller who already failed a few times is asked for proof.
      if (!(await this.challenged(req, options.challenge))) return true;
      mode = 'enforce';
      if (tsMode === 'off') tsMode = 'monitor';
    }
    if (mode === 'off' && tsMode === 'off') return true;
    if (this.signedIn(req)) return true;

    // Web only: the page sends X-Turnstile-Token (the app never does). A
    // token that checks out is as good as an App Check token; a bad one is
    // refused in `enforce`. With no token the App Check rules below apply
    // unchanged, so an app build is never affected by this switch.
    if (tsMode !== 'off' && this.turnstile) {
      const verdict = await this.checkTurnstile(req, tsMode);
      if (verdict === 'pass') return true;
    }
    if (mode === 'off') return true;

    const header = req.header(APP_CHECK_HEADER);
    const token =
      typeof header === 'string' && header.length > 0 && header.length <= 4096
        ? header
        : undefined;
    const consume =
      mode === 'enforce' &&
      this.consumes(req, options) &&
      (await this.replayProtectionOn());
    const result = consume
      ? await this.appCheck.verify(token, { consume: true })
      : await this.appCheck.verify(token);
    const routePath = (req.route as { path?: unknown } | undefined)?.path;
    const route = `${req.method} ${typeof routePath === 'string' ? routePath : req.path}`;
    const free = this.free(req, options);
    this.logger.info(
      {
        metric: 'app_check',
        verdict: result.verdict,
        mode,
        route,
        appId: result.appId,
        reason: result.reason,
        free,
        consume,
      },
      'app check',
    );
    if (mode === 'monitor' || result.verdict === 'valid' || free) return true;
    if (result.verdict === 'unconfigured') {
      this.logger.error(
        { route },
        'App Check is set to enforce but no Firebase project is configured (Админка → Интеграции → FCM): letting the request through',
      );
      return true;
    }
    throw new ForbiddenException({
      code: ErrorCode.DEVICE_ATTESTATION_REQUIRED,
      message: 'This action needs the LawBid app',
    });
  }

  /** 'pass' = a valid Turnstile token; 'continue' = fall back to App Check. */
  private async checkTurnstile(
    req: Request,
    tsMode: AppCheckMode,
  ): Promise<'pass' | 'continue'> {
    const raw = req.header(TURNSTILE_HEADER);
    if (typeof raw !== 'string' || raw.length === 0) return 'continue';
    const result = await this.turnstile!.verify(raw, { ip: req.ip });
    const routePath = (req.route as { path?: unknown } | undefined)?.path;
    this.logger.info(
      {
        metric: 'turnstile',
        verdict: result.verdict,
        mode: tsMode,
        route: `${req.method} ${typeof routePath === 'string' ? routePath : req.path}`,
        hostname: result.hostname,
        reason: result.reason,
      },
      'turnstile',
    );
    if (result.verdict === 'valid') return 'pass';
    if (result.verdict === 'unconfigured' || result.verdict === 'unavailable') {
      // Our setup or Cloudflare is down: never lock the website out.
      this.logger.error(
        { verdict: result.verdict, reason: result.reason },
        'Turnstile could not be checked: falling back to App Check rules',
      );
      return 'continue';
    }
    if (tsMode === 'enforce') {
      throw new ForbiddenException({
        code: ErrorCode.TURNSTILE_FAILED,
        message: 'The bot check failed. Reload the page and try again.',
      });
    }
    return 'continue';
  }

  private async challenged(
    req: Request,
    kind: 'password' | 'otp',
  ): Promise<boolean> {
    if (!this.challenge) return false;
    const body = req.body as unknown;
    if (typeof body !== 'object' || body === null) return false;
    const raw = (body as { identifier?: unknown }).identifier;
    const identifier =
      typeof raw === 'string' && raw.length > 0 && raw.length <= 254
        ? challengeIdentifier(kind, raw)
        : undefined;
    return this.challenge.isChallenged(identifier, req.ip);
  }

  private consumes(req: Request, options: AppCheckOptions): boolean {
    if (!options.consumeWhen) return false;
    const body = req.body as unknown;
    try {
      return (
        typeof body === 'object' &&
        body !== null &&
        options.consumeWhen(body as Record<string, unknown>) === true
      );
    } catch {
      return false;
    }
  }

  private async replayProtectionOn(): Promise<boolean> {
    try {
      return await this.settings.boolean(
        'security.app_check.replay_protection',
      );
    } catch {
      return false;
    }
  }

  private async turnstileMode(): Promise<AppCheckMode> {
    try {
      const raw = await this.settings.string('security.turnstile.mode');
      // Unknown value = off: a typo never starts blocking.
      return (APP_CHECK_MODES as readonly string[]).includes(raw)
        ? (raw as AppCheckMode)
        : 'off';
    } catch {
      return 'off';
    }
  }

  private async mode(): Promise<AppCheckMode> {
    try {
      return parseAppCheckMode(
        await this.settings.string('security.app_check.mode'),
      );
    } catch {
      // Config cache unreachable: watch, never block.
      return 'monitor';
    }
  }

  private signedIn(req: Request): boolean {
    const bearer = /^Bearer (.+)$/i.exec(req.header('authorization') ?? '');
    if (!bearer) return false;
    try {
      this.tokens.verifyAccessToken(bearer[1]);
      return true;
    } catch {
      return false;
    }
  }

  private free(req: Request, options: AppCheckOptions): boolean {
    if (!options.freeWhen) return false;
    const body = req.body as unknown;
    try {
      return (
        typeof body === 'object' &&
        body !== null &&
        options.freeWhen(body as Record<string, unknown>) === true
      );
    } catch {
      return false;
    }
  }
}

/** The account a sign-in attempt is about, written the way the services
 * count failures: a phone keeps its text (trimmed), an e-mail is lower
 * case. `password` accepts either (a leading "+" means phone); `otp`
 * bodies carry the same shape. */
export function challengeIdentifier(
  _kind: 'password' | 'otp',
  raw: string,
): string {
  const value = raw.trim();
  return value.startsWith('+') ? value : value.toLowerCase();
}

export type { AppCheckVerdict };
