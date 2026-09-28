import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { ADMIN_ROLES_KEY } from './admin-roles.decorator';

/** What AdminRolesGuard attaches to the request for the handler. */
export interface RequestAdmin {
  id: string;
  adminRole: AdminRole;
}

/**
 * Interim admin access check for the verifier API (docs/03 §2.5, stage
 * 3.4) until docs/06 stage 6.2 brings the separate admin JWT
 * (`aud = admin`, AdminAuthGuard, @Roles). Runs after the global
 * JwtAuthGuard. Deny by default:
 *  - a route without @AdminRoles(...) is refused;
 *  - the caller must be an active, non-deleted `users.role = 'admin'`
 *    with an `admin_profiles` row whose admin_role is in the allowed set.
 * Role and profile are read from the DB on every call (never from token
 * claims), so revoking an admin takes effect immediately.
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = this.reflector.getAllAndOverride<AdminRole[] | undefined>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser; admin?: RequestAdmin }>();
    if (!allowed || allowed.length === 0 || !req.user) throw forbidden();

    const user = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        role: true,
        status: true,
        deleted_at: true,
        admin_profile: { select: { admin_role: true } },
      },
    });
    const adminRole = user?.admin_profile?.admin_role;
    if (
      !user ||
      user.role !== 'admin' ||
      user.status !== 'active' ||
      user.deleted_at !== null ||
      !adminRole ||
      !allowed.includes(adminRole)
    ) {
      throw forbidden();
    }
    req.admin = { id: req.user.sub, adminRole };
    return true;
  }
}

function forbidden(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Not allowed for this admin role.',
  });
}
