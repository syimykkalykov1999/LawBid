import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { RateLimitService } from './rate-limit.service';

/** Wrong guesses are counted per this window. */
const FAILURE_WINDOW_SECONDS = 15 * 60;
/** One shared address (a mobile carrier, an office) holds many people: the
 * per-address threshold is this many times the per-account one. */
const IP_FACTOR = 5;

export type AuthFailureKind =
  'password' | 'otp_verify' | 'reset_confirm' | 'social';

/**
 * 2026-10-25 (S14-13): "challenge after the first few failures, not on every
 * request" (Cloudflare / AWS WAF ATP credential-stuffing guidance). Wrong
 * passwords and wrong codes are counted per account and per address; once
 * either passes `security.auth_challenge_after_failures` (0 = off, the
 * default) the next password / code attempt must carry a valid App Check or
 * Turnstile token (AppCheckGuard). The happy path never sees it. Each failure
 * also logs `{metric: "auth_failure"}` for the CloudWatch rate alarm.
 */
@Injectable()
export class AuthChallengeService {
  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(AuthChallengeService.name);
  }

  /** A failed password / code. Never throws: counting must not break the
   * answer the caller is about to get. */
  async recordFailure(
    kind: AuthFailureKind,
    identifier: string | undefined,
    ip: string | undefined,
  ): Promise<void> {
    this.logger.info({ metric: 'auth_failure', kind }, 'auth failure');
    try {
      if (identifier) {
        await this.rateLimit.consumeFixedWindow(
          ['auth-fail', 'id', this.rateLimit.hashIdentifier(identifier)],
          Number.MAX_SAFE_INTEGER,
          FAILURE_WINDOW_SECONDS,
        );
      }
      if (ip) {
        await this.rateLimit.consumeFixedWindow(
          ['auth-fail', 'ip', ip],
          Number.MAX_SAFE_INTEGER,
          FAILURE_WINDOW_SECONDS,
        );
      }
    } catch {
      // best effort
    }
  }

  /** True when this account or address has failed enough to need a token. */
  async isChallenged(
    identifier: string | undefined,
    ip: string | undefined,
  ): Promise<boolean> {
    const threshold = await this.threshold();
    if (threshold <= 0) return false;
    try {
      if (identifier) {
        const n = await this.rateLimit.peekFixedWindow([
          'auth-fail',
          'id',
          this.rateLimit.hashIdentifier(identifier),
        ]);
        if (n >= threshold) return true;
      }
      if (ip) {
        const n = await this.rateLimit.peekFixedWindow(['auth-fail', 'ip', ip]);
        if (n >= threshold * IP_FACTOR) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  /** A correct sign-in clears the account's count (the address keeps its). */
  async clear(identifier: string | undefined): Promise<void> {
    if (!identifier) return;
    try {
      await this.rateLimit.resetFixedWindow([
        'auth-fail',
        'id',
        this.rateLimit.hashIdentifier(identifier),
      ]);
    } catch {
      // best effort
    }
  }

  private async threshold(): Promise<number> {
    try {
      const n = await this.settings?.number(
        'security.auth_challenge_after_failures',
      );
      return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }
}
