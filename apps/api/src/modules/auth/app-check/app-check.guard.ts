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
  APP_CHECK_LIMITED_HEADER,
  APP_CHECK_STATUS_HEADER,
  AppCheckService,
  type AppCheckVerdict,
} from './app-check.service';
import {
  autoAllows,
  autoReplayAllows,
  BotCheckStatsService,
  platformCounts,
  platformOf,
  type BotCheckGroup,
  type BotCheckPlatform,
  type BotCheckSample,
} from '../../../common/security/bot-check-stats';

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
  /** Security audit 2026-11-08 (M1): with [challenge], the route ALSO
   * follows `security.app_check.mode` before any failure, like the other
   * auth routes (monitor: log only; enforce: a token is needed); failures
   * then force enforce as before. Without it a [challenge] route is not
   * looked at until the caller has failed. */
  always?: boolean;
  /** Item 13 (L2, 2026-11-25): the admin switch of this route,
   * `security.app_check.<group>.mode` (off = the general
   * `security.app_check.mode`; on = a proof is required; auto = required
   * once the proven-real pass rate allows it). Also the Turnstile action the
   * website names for this route. */
  group?: BotCheckGroup;
  /** The route is for signed-in people (starting a payment): they are
   * checked too, and each of them counts as a proven-real sample. The
   * general mode never makes such a route enforce, only its own switch. */
  signedIn?: boolean;
  /** Keep this request's verdict until the code / reset is finished
   * (@BotCheckProof on the finishing route counts it), keyed by the body's
   * `identifier`. */
  rememberWhen?: (body: Record<string, unknown>) => boolean;
}

/** What the guard concluded about a request, read by BotCheckProofInterceptor
 * once the handler succeeded (a proven-real person). */
export interface BotCheckVerdictOnRequest extends BotCheckSample {
  group: BotCheckGroup;
  valid: boolean;
}

/** The request property the verdict is put on. */
export const BOT_CHECK_REQ_KEY = 'lawbidBotCheck';

/** The owner's Выкл / Вкл / Авто for one route group. Anything unreadable
 * is `off` (the general mode): a typo never starts blocking. */
export type RouteSwitch = 'off' | 'on' | 'auto';
export function parseRouteSwitch(raw: unknown): RouteSwitch {
  return raw === 'on' || raw === 'auto' ? raw : 'off';
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
    // Item 13 (2026-11-25): proven-real pass rate for «Авто».
    @Optional() private readonly stats?: BotCheckStatsService,
  ) {
    this.logger.setContext(AppCheckGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<
      AppCheckOptions | undefined
    >(APP_CHECK_KEY, [context.getHandler(), context.getClass()]);
    if (!options) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const general = await this.mode();
    const sw = options.group ? await this.routeSwitch(options.group) : 'off';
    const platform = platformOf(req.header('x-platform'));
    let tsMode = await this.turnstileMode(options.group);
    let mode = await this.routeMode(options, general, sw, platform, tsMode);
    if (options.challenge) {
      // A caller who already failed a few times is asked for proof; the
      // others pass, unless the route also follows the normal mode.
      if (await this.challenged(req, options.challenge)) {
        mode = 'enforce';
        if (tsMode === 'off') tsMode = 'monitor';
      } else if (!options.always) {
        // Item 13: before a failure this route is blocked only when the
        // owner switched its group on / auto; otherwise it is still watched
        // (log + the proven-real pass rate) while App Check is not off.
        if (sw === 'off' || mode !== 'enforce') {
          if (!options.group) return true;
          mode = general === 'off' ? 'off' : 'monitor';
        }
      }
    }
    if (mode === 'off' && tsMode === 'off') return true;
    if (!options.signedIn && this.signedIn(req)) return true;

    // Web only: the page sends X-Turnstile-Token (the app never does). A
    // token that checks out is as good as an App Check token; a bad one is
    // refused in `enforce`. With no token the App Check rules below apply
    // unchanged, so an app build is never affected by this switch.
    if (tsMode !== 'off' && this.turnstile) {
      const verdict = await this.checkTurnstile(req, tsMode, options.group);
      if (verdict === 'pass') {
        await this.note(req, options, {
          pass: true,
          valid: false,
          limited: false,
          platform,
        });
        return true;
      }
    }
    if (mode === 'off') return true;

    const header = req.header(APP_CHECK_HEADER);
    const token =
      typeof header === 'string' && header.length > 0 && header.length <= 4096
        ? header
        : undefined;
    // The app marks a limited-use token (getLimitedUseToken). Only used to
    // see when replay protection can go on, never to skip anything.
    const limited =
      token !== undefined && req.header(APP_CHECK_LIMITED_HEADER) === '1';
    const consume =
      mode === 'enforce' &&
      this.consumes(req, options) &&
      (await this.replayProtectionOn(options.group));
    const result = consume
      ? await this.appCheck.verify(token, { consume: true })
      : await this.appCheck.verify(token);
    const route = routeOf(req);
    const free = this.free(req, options);
    this.logger.info(
      {
        metric: 'app_check',
        verdict: result.verdict,
        mode,
        group: options.group,
        switch: options.group ? sw : undefined,
        route,
        appId: result.appId,
        reason: result.reason,
        free,
        consume,
        limited,
        // 2026-11-08: which app sent it and, without a token, why the
        // device had none (every prod verdict was `missing`, cause unseen).
        platform: shortHeader(req, 'x-platform', 16),
        appVersion: shortHeader(req, 'x-app-version', 32),
        clientStatus:
          result.verdict === 'missing'
            ? shortHeader(req, APP_CHECK_STATUS_HEADER, 120)
            : undefined,
      },
      'app check',
    );
    const valid = result.verdict === 'valid';
    if (mode === 'monitor' || valid || free) {
      if (result.verdict !== 'unconfigured') {
        await this.note(req, options, {
          pass: valid,
          valid,
          limited: valid && limited,
          platform,
        });
      }
      return true;
    }
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

  /** Puts the verdict on the request (BotCheckProofInterceptor counts it
   * after success), keeps it for the finishing step (rememberWhen), and
   * counts a signed-in caller at once (already a proven person). */
  private async note(
    req: Request,
    options: AppCheckOptions,
    sample: BotCheckSample & { valid: boolean },
  ): Promise<void> {
    const group = options.group;
    if (!group) return;
    const onReq: BotCheckVerdictOnRequest = { ...sample, group };
    (req as unknown as Record<string, unknown>)[BOT_CHECK_REQ_KEY] = onReq;
    if (!this.stats) return;
    if (options.signedIn) {
      await this.stats.record(group, sample);
      return;
    }
    const body = req.body as unknown;
    if (!options.rememberWhen || typeof body !== 'object' || body === null) {
      return;
    }
    const b = body as Record<string, unknown>;
    let remember: boolean;
    try {
      remember = options.rememberWhen(b) === true;
    } catch {
      remember = false;
    }
    const id = b.identifier;
    if (
      remember &&
      typeof id === 'string' &&
      id.length > 0 &&
      id.length <= 254
    ) {
      await this.stats.rememberPending(group, id, sample);
    }
  }

  /** The effective mode of a route: its own switch first, then the
   * general one (capped at monitor for signed-in routes). Holes re-check
   * (25.11): the route switch never enforces on the website while the
   * website has no working proof (no Turnstile keys and not one valid
   * proof from it in the window): every real visitor would be refused. */
  private async routeMode(
    options: AppCheckOptions,
    general: AppCheckMode,
    sw: RouteSwitch,
    platform: BotCheckPlatform,
    tsMode: AppCheckMode,
  ): Promise<AppCheckMode> {
    const base: AppCheckMode = options.signedIn
      ? general === 'off'
        ? 'off'
        : 'monitor'
      : general;
    if (!options.group || sw === 'off') return base;
    const want =
      sw === 'on' || (await this.autoOn(options.group)) ? 'enforce' : base;
    if (want !== 'enforce' || base === 'enforce' || platform !== 'web') {
      return want;
    }
    if (await this.webProofWorks(options.group, tsMode)) return want;
    this.logger.info(
      { metric: 'app_check_web_unproven', group: options.group, switch: sw },
      'bot check: the website has no working proof yet (no Turnstile keys, no valid web proof): not enforced there',
    );
    return base === 'off' ? 'monitor' : base;
  }

  /** The website can prove itself: Turnstile is on with both keys saved,
   * or at least one proven-real web visitor of this group passed the check
   * (App Check by reCAPTCHA Enterprise works) over the Auto window. */
  private async webProofWorks(
    group: BotCheckGroup,
    tsMode: AppCheckMode,
  ): Promise<boolean> {
    if (tsMode !== 'off' && (await this.turnstileConfigured())) return true;
    if (!this.stats) return false;
    try {
      const [days] = await this.autoSettings();
      const web = (await this.stats.counts(group, days)).byPlatform.web;
      return (web?.pass ?? 0) > 0;
    } catch {
      return false;
    }
  }

  private async turnstileConfigured(): Promise<boolean> {
    if (!this.turnstile) return false;
    try {
      return await this.turnstile.configured();
    } catch {
      return false;
    }
  }

  private async routeSwitch(group: BotCheckGroup): Promise<RouteSwitch> {
    try {
      return parseRouteSwitch(
        await this.settings.string(ROUTE_SWITCH_KEYS[group]),
      );
    } catch {
      return 'off';
    }
  }

  /** «Авто»: the proven-real pass rate of this group over the last N days
   * (admin settings) is high enough. Unreadable = not yet (log only). */
  private async autoOn(group: BotCheckGroup): Promise<boolean> {
    if (!this.stats) return false;
    try {
      const [days, pct, min] = await this.autoSettings();
      return autoAllows(await this.stats.counts(group, days), pct, min);
    } catch {
      return false;
    }
  }

  private autoSettings(): Promise<[number, number, number]> {
    return Promise.all([
      this.settings.number('security.app_check.auto_days'),
      this.settings.number('security.app_check.auto_pass_rate_pct'),
      this.settings.number('security.app_check.auto_min_requests'),
    ]);
  }

  /** 'pass' = a valid Turnstile token; 'continue' = fall back to App Check. */
  private async checkTurnstile(
    req: Request,
    tsMode: AppCheckMode,
    group?: BotCheckGroup,
  ): Promise<'pass' | 'continue'> {
    const raw = req.header(TURNSTILE_HEADER);
    if (typeof raw !== 'string' || raw.length === 0) return 'continue';
    // Item 13 (L3): the page names the route group as the widget's action;
    // a token solved for another form is refused (an older page that names
    // none still passes, see TurnstileService).
    const result = await this.turnstile!.verify(
      raw,
      group ? { ip: req.ip, expectedAction: group } : { ip: req.ip },
    );
    this.logger.info(
      {
        metric: 'turnstile',
        verdict: result.verdict,
        mode: tsMode,
        group,
        route: routeOf(req),
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

  /** Replay protection (consume the token): the old switch
   * `security.app_check.replay_protection` = true, or
   * `security.app_check.replay.mode` = on, or auto once nearly every valid
   * token of this group is limited-use. */
  private async replayProtectionOn(group?: BotCheckGroup): Promise<boolean> {
    try {
      if (await this.settings.boolean('security.app_check.replay_protection'))
        return true;
    } catch {
      // fall through to the 3-state switch
    }
    let sw: RouteSwitch;
    try {
      sw = parseRouteSwitch(
        await this.settings.string('security.app_check.replay.mode'),
      );
    } catch {
      return false;
    }
    if (sw === 'on') return true;
    if (sw === 'off' || !group || !this.stats) return false;
    try {
      const [days, pct, min] = await this.autoSettings();
      return autoReplayAllows(await this.stats.counts(group, days), pct, min);
    } catch {
      return false;
    }
  }

  /** `security.turnstile.mode`: off | monitor | enforce | auto. Holes
   * re-check (25.11): auto = off until both Turnstile keys are saved, then
   * monitor, and enforce once the website's proven-real visitors of this
   * group pass at the Auto rate (the same rule as the App Check groups). */
  private async turnstileMode(group?: BotCheckGroup): Promise<AppCheckMode> {
    let raw: string;
    try {
      raw = await this.settings.string('security.turnstile.mode');
    } catch {
      return 'off';
    }
    // Unknown value = off: a typo never starts blocking.
    if ((APP_CHECK_MODES as readonly string[]).includes(raw)) {
      return raw as AppCheckMode;
    }
    if (raw !== 'auto') return 'off';
    if (!(await this.turnstileConfigured())) return 'off';
    if (!group || !this.stats) return 'monitor';
    try {
      const [days, pct, min] = await this.autoSettings();
      const web = platformCounts(await this.stats.counts(group, days), 'web');
      return autoAllows(web, pct, min) ? 'enforce' : 'monitor';
    } catch {
      return 'monitor';
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

/** The admin switch of each route group (Выкл / Вкл / Авто). */
export const ROUTE_SWITCH_KEYS = {
  sms: 'security.app_check.sms.mode',
  login: 'security.app_check.login.mode',
  password_reset: 'security.app_check.password_reset.mode',
  payments: 'security.app_check.payments.mode',
} as const satisfies Record<BotCheckGroup, string>;

function routeOf(req: Request): string {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  return `${req.method} ${typeof routePath === 'string' ? routePath : req.path}`;
}

/** A client header for the log: printable ASCII only, at most [max]
 * characters, undefined when absent. Never used for a decision. */
function shortHeader(
  req: Request,
  name: string,
  max: number,
): string | undefined {
  const raw = req.header(name);
  if (typeof raw !== 'string') return undefined;
  const clean = raw.replace(/[^\x20-\x7e]/g, '').trim();
  return clean.length > 0 ? clean.slice(0, max) : undefined;
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
