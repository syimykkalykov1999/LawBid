import {
  applyDecorators,
  createParamDecorator,
  HttpStatus,
  SetMetadata,
  UseGuards,
  UseInterceptors,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import type { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import { ApiErrors, COMMON_ERRORS } from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuthGuard } from './admin-auth.guard';

export const ADMIN_ROLES_KEY = 'lawbid:admin-roles';
export const JUSTIFICATION_KEY = 'lawbid:admin-justification';
export const SKIP_AUTO_AUDIT_KEY = 'lawbid:admin-skip-auto-audit';
export const AUDIT_ACTION_KEY = 'lawbid:admin-audit-action';

export const ALL_ADMIN_ROLES: readonly AdminRole[] = [
  'super_admin',
  'moderator',
  'verifier',
  'support',
  'finance',
];

/** Admin roles allowed on a route/controller (docs/06 §2.2). A route
 * under AdminAuthGuard without it is denied (deny by default). */
export const Roles = (
  ...roles: AdminRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ADMIN_ROLES_KEY, roles);

/** docs/06 §2.1: viewing sensitive data needs a reason (≥ 10 chars) in
 * the `X-Justification` header; it lands in audit_log.justification. */
export const Justification = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(JUSTIFICATION_KEY, true),
    ApiHeader({
      name: 'X-Justification',
      required: true,
      description: 'Why the data is being viewed (10–500 characters).',
    }),
    ApiErrors({ 400: [ErrorCode.JUSTIFICATION_REQUIRED] }),
  );

/** The service already writes its own (richer) audit_log row for this
 * action; the interceptor must not add a generic one. */
export const SkipAutoAudit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_AUTO_AUDIT_KEY, true);

/** Overrides the auto-audit action name (`admin.<name>`). */
export const AuditAction = (name: string): MethodDecorator =>
  SetMetadata(AUDIT_ACTION_KEY, name);

export const ADMIN_ERRORS = {
  ...COMMON_ERRORS,
  [HttpStatus.UNAUTHORIZED]: [
    ErrorCode.UNAUTHORIZED,
    ErrorCode.TOKEN_EXPIRED,
    ErrorCode.AUTH_SESSION_REVOKED,
  ],
  [HttpStatus.FORBIDDEN]: [ErrorCode.FORBIDDEN],
};

/**
 * Everything an `/admin/*` controller needs: opts out of the mobile
 * JwtAuthGuard (@Public — the admin token has a different audience and
 * would be a 401 there anyway), enforces the admin JWT + Redis session +
 * role set, and audits every mutating request.
 */
export const AdminEndpoint = (
  ...roles: AdminRole[]
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    Public(),
    Roles(...roles),
    UseGuards(AdminAuthGuard),
    UseInterceptors(AdminAuditInterceptor),
    ApiBearerAuth('admin'),
    ApiErrors(ADMIN_ERRORS),
  );

/** What AdminAuthGuard attaches to the request. */
export interface RequestAdmin {
  id: string;
  adminRole: AdminRole;
  sessionId: string;
  justification: string | null;
}

/** The admin resolved by AdminAuthGuard plus the client IP (audit_log). */
export interface AdminActor extends RequestAdmin {
  ip: string | null;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminActor => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { admin?: RequestAdmin }>();
    if (!req.admin) {
      throw new Error('CurrentAdmin used on a route without AdminAuthGuard');
    }
    return { ...req.admin, ip: req.ip ?? null };
  },
);
