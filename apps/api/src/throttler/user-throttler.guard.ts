import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../modules/auth/services/token.service';

/**
 * OQ-048: the global rate limit counts per signed-in user (a verified
 * access token), not per IP — an attorney and up to six assistants often
 * share one office IP. Anonymous requests (and invalid tokens) still
 * count per IP.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly tokens: TokenService,
  ) {
    super(options, storage, reflector);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, string | undefined>;
    const auth = headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        return Promise.resolve(
          `u:${this.tokens.verifyAccessToken(auth.slice(7)).sub}`,
        );
      } catch {
        // Invalid / expired: fall back to the IP.
      }
    }
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    return Promise.resolve(`ip:${ip}`);
  }
}
