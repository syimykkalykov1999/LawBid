import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { REAUTH_REQUIRED_KEY } from '../decorators/reauth-required.decorator';
import {
  TokenService,
  TokenVerifyExpiredError,
  TokenVerifyInvalidError,
} from '../services/token.service';
import type { RequestUser } from '../decorators/current-user.decorator';

const REAUTH_HEADER = 'x-reauth-token';

/**
 * Route-level guard for actions the spec calls "sensitive" (contact
 * change, account deletion — docs/01_FOUNDATION_AUTH.md §10.1, §11):
 * requires a short-lived reauthToken from POST /auth/reauth, sent as the
 * X-Reauth-Token header (the spec names the token but not its transport —
 * engineering judgment, docs/CHANGELOG.md stage 1.4).
 *
 * Runs AFTER JwtAuthGuard (global guards execute before route-level
 * ones), so req.user is already set — the reauth token must additionally
 * be bound to the SAME user and session chain, so a reauth token minted
 * for one session can't authorize a sensitive action on another.
 *
 * Single-use: the token's jti is marked spent in Redis on first use, so a
 * captured reauthToken can't be replayed for its full 5-minute window.
 */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REAUTH_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const header = req.header(REAUTH_HEADER);
    if (!header) {
      throw new ForbiddenException({
        code: ErrorCode.REAUTH_REQUIRED,
        message: 'This action requires recent reauthentication.',
      });
    }

    let claims;
    try {
      claims = this.tokenService.verifyReauthToken(header);
    } catch (error) {
      if (
        error instanceof TokenVerifyExpiredError ||
        error instanceof TokenVerifyInvalidError
      ) {
        throw new UnauthorizedException({
          code: ErrorCode.REAUTH_INVALID,
          message: 'Reauth token invalid or expired.',
        });
      }
      throw error;
    }

    if (claims.sub !== req.user?.sub || claims.sid !== req.user?.sid) {
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'Reauth token does not match the current session.',
      });
    }

    const usedKey = `reauth:used:${claims.jti}`;
    const ttl = this.config.getOrThrow<number>('REAUTH_TOKEN_TTL_SECONDS');
    // SET ... NX: first caller wins the token, any replay (even a
    // concurrent one) fails.
    const firstUse = await this.redis.set(usedKey, '1', 'EX', ttl, 'NX');
    if (firstUse !== 'OK') {
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'Reauth token already used.',
      });
    }

    return true;
  }
}
