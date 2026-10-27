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
import { AdminPiiMaskInterceptor } from './admin-pii-mask.interceptor';
import { AdminAuthGuard } from './admin-auth.guard';
import type { AdminPermissions, PartnerMembership } from './admin-permissions';
import {
  PRIVATE_REASON_CODES,
  type PrivateKind,
} from './admin-private-content';

export const ADMIN_ROLES_KEY = 'lawbid:admin-roles';
export const JUSTIFICATION_KEY = 'lawbid:admin-justification';
export const SKIP_AUTO_AUDIT_KEY = 'lawbid:admin-skip-auto-audit';
export const AUDIT_ACTION_KEY = 'lawbid:admin-audit-action';
/** Owner 2026-10-28: the route reads private content (value = the kind). */
export const PRIVATE_READ_KEY = 'lawbid:admin-private-read';
/** Owner 2026-10-28: the audit row is written BEFORE the action; if it
 * cannot be written the action does not run (fail closed). */
export const STRICT_AUDIT_KEY = 'lawbid:admin-strict-audit';

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

/**
 * Owner 2026-10-28 (attorney-client privilege): reading private content
 * (1:1 chats, call metadata, case files, private documents) needs BOTH
 * `X-Reason-Code` (one of PRIVATE_REASON_CODES) and `X-Justification`
 * (free text, 10–500 chars) — for every admin, the owner included. The
 * read is an audit row written before any data leaves (fail closed).
 */
export const PrivateRead = (kind: PrivateKind): MethodDecorator =>
  applyDecorators(
    SetMetadata(PRIVATE_READ_KEY, kind),
    SetMetadata(JUSTIFICATION_KEY, true),
    SetMetadata(STRICT_AUDIT_KEY, true),
    ApiHeader({
      name: 'X-Reason-Code',
      required: true,
      description: `One of: ${PRIVATE_REASON_CODES.join(', ')}.`,
    }),
    ApiHeader({
      name: 'X-Justification',
      required: true,
      description: 'Free-text reason (10–500 characters).',
    }),
    ApiErrors({
      400: [ErrorCode.JUSTIFICATION_REQUIRED, ErrorCode.REASON_CODE_REQUIRED],
    }),
  );

/** Fail-closed auditing for a sensitive route (see STRICT_AUDIT_KEY). */
export const StrictAudit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(STRICT_AUDIT_KEY, true);

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
    UseInterceptors(AdminAuditInterceptor, AdminPiiMaskInterceptor),
    ApiBearerAuth('admin'),
    ApiErrors(ADMIN_ERRORS),
  );

/** What AdminAuthGuard attaches to the request. */
export interface RequestAdmin {
  id: string;
  adminRole: AdminRole;
  sessionId: string;
  justification: string | null;
  /** Owner 2026-10-28: the coded reason of a private-content read. */
  reasonCode?: string | null;
  /** Area toggles (empty for the super admin, who needs none). */
  permissions?: AdminPermissions;
  /** The super admin gave this admin the right to manage other admins. */
  manageAdmins?: boolean;
  /** Owner 2026-10-06: the country partner team this admin belongs to. */
  partner?: PartnerMembership | null;
  /** Owner 2026-10-16: personal data in responses is masked for this admin. */
  noPii?: boolean;
  /** Owner 2026-10-05: countries this admin's lists are limited to on
   * this request (assigned countries narrowed by the picked tab); null or
   * absent = every country. */
  countries?: string[] | null;
  /** Countries assigned to this admin (empty = every country). */
  assignedCountries?: string[];
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
