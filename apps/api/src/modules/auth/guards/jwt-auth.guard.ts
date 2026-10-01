import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ASSISTANT_SELF,
  ATTORNEY_ONLY,
  AssistantContextService,
  REQUIRES_DUTY,
} from '../assistant/assistant-context';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  TokenService,
  TokenVerifyExpiredError,
  TokenVerifyInvalidError,
} from '../services/token.service';
import { SessionRevocationService } from '../services/session-revocation.service';
import type { RequestUser } from '../decorators/current-user.decorator';

/**
 * Global guard (registered as APP_GUARD inside AuthModule, see auth.module
 * .ts) — fail-closed by default so a controller added in a later stage is
 * protected unless it explicitly opts out with @Public(). Runs after the
 * existing global ThrottlerGuard (registration order in AppModule): cheap
 * rate-limit rejection happens before any crypto.
 *
 * Exactly one Redis round trip (the blacklist check) — no DB query. See
 * SessionRevocationService's doc comment for why blacklist TTL alone is
 * sufficient without per-request session lookups.
 *
 * docs/01_FOUNDATION_AUTH.md §10.4: the mobile client's dio interceptor
 * keys off a 401 with code EXACTLY "TOKEN_EXPIRED" to trigger silent
 * refresh. Getting the OTHER 401 causes right matters just as much: a
 * malformed/bad-signature/wrong-audience token or a blacklisted session
 * must NOT return TOKEN_EXPIRED, or the client loops refreshing a token
 * that refreshing can never fix.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly revocation: SessionRevocationService,
    private readonly assistants: AssistantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<
      Request & {
        user?: RequestUser;
        userId?: string;
      }
    >();

    const token = this.extractBearerToken(req);
    if (!token) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Missing bearer token.',
      });
    }

    let claims;
    try {
      claims = this.tokenService.verifyAccessToken(token);
    } catch (error) {
      if (error instanceof TokenVerifyExpiredError) {
        throw new UnauthorizedException({
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'Access token expired.',
        });
      }
      if (error instanceof TokenVerifyInvalidError) {
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid access token.',
        });
      }
      throw error;
    }

    if (await this.revocation.isBlacklisted(claims.sid)) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SESSION_REVOKED,
        message: 'Session has been revoked.',
      });
    }

    // OQ-048: an assistant works inside the attorney's account — every
    // attorney endpoint then serves the attorney's data, with the
    // assistant kept on `user.assistant` for limits and the activity log.
    if (claims.role === 'assistant') {
      const self = this.reflector.getAllAndOverride<boolean>(ASSISTANT_SELF, [
        context.getHandler(),
        context.getClass(),
      ]);
      const ctx = self ? null : await this.assistants.resolve(claims.sub);
      if (ctx) {
        const attorneyOnly = this.reflector.getAllAndOverride<boolean | string>(
          ATTORNEY_ONLY,
          [context.getHandler(), context.getClass()],
        );
        const delegated =
          typeof attorneyOnly === 'string' && ctx.duties.includes(attorneyOnly);
        if (attorneyOnly && !delegated) {
          throw new ForbiddenException({
            code: ErrorCode.ASSISTANT_NOT_ALLOWED,
            message: 'Only the attorney can do this.',
          });
        }
        const duty = this.reflector.getAllAndOverride<string>(REQUIRES_DUTY, [
          context.getHandler(),
          context.getClass(),
        ]);
        if (duty && !ctx.duties.includes(duty)) {
          throw new ForbiddenException({
            code: ErrorCode.ASSISTANT_NOT_ALLOWED,
            message: 'The attorney has not given you this duty.',
            details: { duty },
          });
        }
        req.user = {
          ...claims,
          sub: ctx.attorneyId,
          role: 'attorney',
          verified: true,
          assistant: {
            userId: claims.sub,
            membershipId: ctx.membershipId,
            name: ctx.name,
            duties: ctx.duties,
          },
        };
        req.userId = ctx.attorneyId;
        return true;
      }
    }

    req.user = claims;
    req.userId = claims.sub;
    return true;
  }

  private extractBearerToken(req: Request): string | undefined {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length).trim() || undefined;
  }
}
