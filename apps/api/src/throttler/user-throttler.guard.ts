import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { AppSettingsService } from '../common/app-settings/app-settings.service';
import { TokenService } from '../modules/auth/services/token.service';
import {
  ADMIN_BLOCK_MS,
  ADMIN_THROTTLE_DEFAULT,
  adminThrottleLimit,
} from './throttle-limits';

/** @nestjs/throttler's metadata key for a route's @Throttle limit (not exported). */
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
/** The tracker is resolved once per request (the JWT is verified once). */
const trackers = new WeakMap<object, string>();

/**
 * OQ-048: the global rate limit counts per signed-in user (a verified
 * access token), not per IP — an attorney and up to six assistants often
 * share one office IP. Anonymous requests (and invalid tokens) still
 * count per IP.
 *
 * Owner 2026-10-05: a signed-in admin (`a:<adminId>`) gets its own, higher
 * per-minute limit — the panel keeps several queues live on one screen and
 * hit «Слишком много запросов» at the shared 100/min. The admin limit is
 * `security.admin_rate_limit_per_minute` (Система → Настройки, default
 * 600); `ADMIN_THROTTLE_LIMIT` in the env wins over it, as a way back in
 * if the setting is ever saved too low. Going over it blocks the admin
 * only for ADMIN_BLOCK_MS past the current one-minute window, never for
 * hours. A route's own @Throttle stays as written. Users, assistants and
 * anonymous callers keep the default limit.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly settings: AppSettingsService,
  ) {
    super(options, storage, reflector);
  }

  protected override async handleRequest(
    props: ThrottlerRequest,
  ): Promise<boolean> {
    const req = props.context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    const routeLimit = this.reflector.getAllAndOverride<unknown>(
      THROTTLER_LIMIT + props.throttler.name,
      [props.context.getHandler(), props.context.getClass()],
    );
    if (
      routeLimit === undefined &&
      (await this.getTracker(req)).startsWith('a:')
    ) {
      return super.handleRequest({
        ...props,
        limit: await this.adminLimit(),
        blockDuration: Math.min(props.blockDuration, ADMIN_BLOCK_MS),
      });
    }
    return super.handleRequest(props);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    let tracker = trackers.get(req);
    if (tracker === undefined) {
      tracker = this.resolveTracker(req);
      trackers.set(req, tracker);
    }
    return Promise.resolve(tracker);
  }

  private resolveTracker(req: Record<string, unknown>): string {
    const headers = req.headers as Record<string, string | undefined>;
    const auth = headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        return `u:${this.tokens.verifyAccessToken(auth.slice(7)).sub}`;
      } catch {
        // Not a user token: maybe an admin one (below).
      }
      try {
        // The admin panel calls the API from its own server, so every
        // admin would otherwise share that one IP bucket.
        return `a:${this.tokens.verifyAdminToken(auth.slice(7)).sub}`;
      } catch {
        // Invalid / expired: fall back to the IP.
      }
    }
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    return `ip:${ip}`;
  }

  private async adminLimit(): Promise<number> {
    let fromSettings = ADMIN_THROTTLE_DEFAULT;
    try {
      fromSettings = await this.settings.number(
        'security.admin_rate_limit_per_minute',
      );
    } catch {
      // Config cache unreachable: keep the default rather than fail the call.
    }
    return adminThrottleLimit(fromSettings, process.env.ADMIN_THROTTLE_LIMIT);
  }
}
