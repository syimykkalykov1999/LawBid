import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  TokenService,
  TokenVerifyExpiredError,
  TokenVerifyInvalidError,
} from './token.service';
import type { RequestUser } from '../decorators/current-user.decorator';

const REAUTH_HEADER = 'x-reauth-token';

/** Owner 2026-10-22 (security audit #3): a sign-in this recent IS the
 * re-authentication (the person has just typed the SMS / e-mail code or
 * the password) — OWASP ASVS V3.7.1 accepts "a full, valid login session".
 * It keeps sign-up one code long: the password and the first e-mail right
 * after the sign-up code need no second code. Counted from the first
 * session row of the chain, so refreshing never makes a session "fresh". */
export const FRESH_SIGN_IN_SECONDS = 600;

/**
 * Validates and consumes the single-use `X-Reauth-Token` (docs/01 §10.1,
 * §10.5 POST /auth/reauth). Used by ReauthGuard for always-protected
 * routes and directly by services whose reauth need depends on state
 * (e.g. changing an already-verified contact, but not adding the first).
 */
@Injectable()
export class ReauthVerifier {
  constructor(
    private readonly tokenService: TokenService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** True when the request carries an X-Reauth-Token header at all. */
  hasToken(req: Request): boolean {
    return Boolean(req.header(REAUTH_HEADER));
  }

  /**
   * Owner 2026-10-22 (security audit #3, findings 1–2): sensitive account
   * changes (a new contact, a password) need either a fresh single-use
   * reauth token, or a sign-in made within [FRESH_SIGN_IN_SECONDS] on this
   * very session. A stolen access token of an older session can no longer
   * attach the thief's e-mail or password to the account.
   */
  async assertRecentAuthentication(
    req: Request & { user?: RequestUser },
  ): Promise<void> {
    if (this.hasToken(req)) {
      await this.assertAndConsume(req);
      return;
    }
    if (await this.signedInRecently(req.user)) return;
    throw new ForbiddenException({
      code: ErrorCode.REAUTH_REQUIRED,
      message: 'This action requires recent reauthentication.',
    });
  }

  private async signedInRecently(user?: RequestUser): Promise<boolean> {
    if (!user?.sid || !user.sub) return false;
    const first = await this.prisma.session.findFirst({
      where: { session_chain_id: user.sid, user_id: user.sub },
      orderBy: { created_at: 'asc' },
      select: { created_at: true },
    });
    return (
      first !== null &&
      Date.now() - first.created_at.getTime() <= FRESH_SIGN_IN_SECONDS * 1000
    );
  }

  /**
   * Validates the header token for the current session WITHOUT consuming
   * it: read-only screens behind reauth (docs/04 §12 "История кейсов":
   * list, pages, case timelines) stay open for the token's 5-minute life.
   * A token already consumed by a sensitive action is still rejected.
   */
  async assertValid(req: Request & { user?: RequestUser }): Promise<void> {
    const claims = this.verify(req);
    if (await this.redis.exists(`reauth:used:${claims.jti}`)) {
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'Reauth token already used.',
      });
    }
  }

  async assertAndConsume(req: Request & { user?: RequestUser }): Promise<void> {
    const claims = this.verify(req);
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
  }

  private verify(req: Request & { user?: RequestUser }): {
    sub: string;
    sid: string;
    jti: string;
  } {
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

    return claims;
  }
}
