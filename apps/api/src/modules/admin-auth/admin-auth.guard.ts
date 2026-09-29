import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TokenService,
  TokenVerifyExpiredError,
  TokenVerifyInvalidError,
} from '../auth/services/token.service';
import {
  ADMIN_ROLES_KEY,
  JUSTIFICATION_KEY,
  type RequestAdmin,
} from './admin-auth.decorators';
import { AdminSessionService } from './admin-session.service';

export const JUSTIFICATION_MIN = 10;
export const JUSTIFICATION_MAX = 500;

/**
 * docs/06 §2.1–2.2: the admin JWT (`aud = lawbid-admin`, issued only
 * after email code + TOTP) plus its Redis session (8 h absolute, 30 min
 * idle), then the RBAC matrix — deny by default:
 *  - a route without @Roles(...) is refused;
 *  - the account must still be an active, non-deleted `users.role =
 *    'admin'` with an `admin_profiles` row whose role is allowed — read
 *    from the DB on every call (never trusted from the token) so
 *    disabling an admin or changing a role applies immediately;
 *  - @Justification() routes need `X-Justification` (10–500 chars).
 * Mobile access tokens fail the audience check → 401, never 403.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: AdminSessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { admin?: RequestAdmin }>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ')
      ? header.slice(7).trim()
      : undefined;
    if (!token) throw unauthorized('Missing bearer token.');

    let claims;
    try {
      claims = this.tokens.verifyAdminToken(token);
    } catch (error) {
      if (error instanceof TokenVerifyExpiredError) {
        throw new UnauthorizedException({
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'Admin session expired.',
        });
      }
      if (error instanceof TokenVerifyInvalidError) {
        throw unauthorized('Invalid admin token.');
      }
      throw error;
    }

    const sessionUser = await this.sessions.touch(claims.jti);
    if (!sessionUser || sessionUser !== claims.sub) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SESSION_REVOKED,
        message: 'Admin session ended (idle timeout or revoked).',
      });
    }

    const allowed = this.reflector.getAllAndOverride<AdminRole[] | undefined>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed || allowed.length === 0) throw forbidden();

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        role: true,
        status: true,
        deleted_at: true,
        admin_profile: { select: { admin_role: true } },
      },
    });
    if (
      !user ||
      user.role !== 'admin' ||
      user.status !== 'active' ||
      user.deleted_at ||
      !user.admin_profile
    ) {
      throw forbidden();
    }
    const adminRole = user.admin_profile.admin_role;
    if (!allowed.includes(adminRole)) throw forbidden();

    const needsJustification = this.reflector.getAllAndOverride<boolean>(
      JUSTIFICATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    let justification: string | null = null;
    if (needsJustification) {
      const raw = (req.header('x-justification') ?? '').trim();
      if (raw.length < JUSTIFICATION_MIN || raw.length > JUSTIFICATION_MAX) {
        throw new BadRequestException({
          code: ErrorCode.JUSTIFICATION_REQUIRED,
          message: `X-Justification header (${JUSTIFICATION_MIN}–${JUSTIFICATION_MAX} characters) is required to view this data.`,
        });
      }
      justification = raw;
    }

    req.admin = {
      id: claims.sub,
      adminRole,
      sessionId: claims.jti,
      justification,
    };
    return true;
  }
}

const unauthorized = (message: string) =>
  new UnauthorizedException({ code: ErrorCode.UNAUTHORIZED, message });

const forbidden = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Admin role required.',
  });
