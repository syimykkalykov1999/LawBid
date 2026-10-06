import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
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
import {
  canAccess,
  effectiveCountries,
  levelForMethod,
  parsePermissions,
  readCountries,
  readManageAdmins,
  readPartner,
  routeArea,
  VIEW_AUDITED_AREAS,
} from './admin-permissions';
import { AdminSessionService } from './admin-session.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';

export const JUSTIFICATION_MIN = 10;
/** Handlers whose body DTO declares `reason` (cached per handler). */
const reasonRoutes = new WeakMap<object, boolean>();
function takesReason(context: ExecutionContext): boolean {
  const handler = context.getHandler();
  const known = reasonRoutes.get(handler);
  if (known !== undefined) return known;
  const types = (Reflect.getMetadata(
    'design:paramtypes',
    context.getClass().prototype as object,
    handler.name,
  ) ?? []) as unknown[];
  const found = types.some((t) => {
    if (typeof t !== 'function' || t === Object || t === String) return false;
    try {
      const probe = new (t as new () => object)();
      return typeof probe === 'object' && probe !== null && 'reason' in probe;
    } catch {
      return false;
    }
  });
  reasonRoutes.set(handler, found);
  return found;
}

/** Owner 2026-10-05: a required action reason (see assertReason). */
export const REASON_MIN = 3;
export const JUSTIFICATION_MAX = 500;

/**
 * docs/06 §2.1–2.2: the admin JWT (`aud = lawbid-admin`, issued only
 * after login + password, plus the authenticator when that admin turned it on) plus its Redis session (8 h absolute, 30 min
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
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly settings?: AppSettingsService,
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
        admin_profile: { select: { admin_role: true, permissions: true } },
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
    const permissions = parsePermissions(user.admin_profile.permissions);
    // Owner 2026-10-06: a country partner's team (never the deputy).
    const partner =
      adminRole === 'super_admin'
        ? null
        : readPartner(user.admin_profile.permissions);
    const manageAdmins =
      adminRole !== 'super_admin' &&
      !partner &&
      readManageAdmins(user.admin_profile.permissions);
    if (adminRole === 'super_admin') {
      if (!allowed.includes(adminRole)) throw forbidden();
    } else {
      const path = req.originalUrl || req.url;
      // Owner 2026-10-02: everyone but the super admin works by the area
      // toggles; money and keys are closed for them in the API itself (not
      // only hidden in the panel). Admin management needs the right the
      // super admin gives one by one.
      // The trusted deputy also reads the owner-only pages (sessions,
      // prices, plans), except the keys; changing them stays the owner's.
      const deputyRead =
        manageAdmins &&
        routeArea(path) !== 'keys' &&
        levelForMethod(req.method) === 'view';
      const superOnly =
        allowed.length === 1 && allowed[0] === 'super_admin' && !deputyRead;
      if (
        superOnly ||
        !canAccess(
          adminRole,
          permissions,
          path,
          req.method,
          manageAdmins,
          partner,
        )
      ) {
        // Owner 2026-10-05: a section the admin has no right to answers
        // like it doesn't exist (404, not 403), and the attempt is audited.
        this.note('admin.access_denied', claims.sub, req.method, path, req.ip);
        throw hidden();
      }
      // Owner 2026-10-05: who looked at money is visible in the audit log.
      const area = routeArea(path);
      await this.assertReason(area, req.method, req.body, context);
      if (
        area &&
        VIEW_AUDITED_AREAS.has(area) &&
        levelForMethod(req.method) === 'view'
      ) {
        this.note('admin.view', claims.sub, req.method, path, req.ip);
      }
    }

    const needsJustification = this.reflector.getAllAndOverride<boolean>(
      JUSTIFICATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    let justification: string | null = null;
    if (needsJustification) {
      // Owner 2026-10-05: the owner never has to explain; the access is
      // still written to the log (with the text when one is given). A
      // legal data-request package keeps its basis (subpoena record).
      const ownerFree =
        adminRole === 'super_admin' &&
        routeArea(req.originalUrl || req.url) !== 'data_requests';
      justification = ownerFree
        ? decodeJustification(req.header('x-justification')) || null
        : readJustification(req.header('x-justification'));
    }

    const assignedCountries =
      adminRole === 'super_admin'
        ? []
        : readCountries(user.admin_profile.permissions);
    req.admin = {
      id: claims.sub,
      adminRole,
      sessionId: claims.jti,
      justification,
      permissions,
      manageAdmins,
      partner,
      assignedCountries,
      countries: effectiveCountries(
        adminRole === 'super_admin',
        assignedCountries,
        req.header('x-admin-country'),
      ),
    };
    // Last action shown in the sessions overview (fire and forget).
    void this.sessions.noteActivity(
      claims.jti,
      `${req.method} ${(req.originalUrl || req.url).split('?')[0]}`,
    );
    return true;
  }

  /** Owner 2026-10-05: the owner never has to give a reason; other
   * admins must in the sections switched on in «Обязательная причина»
   * (a write whose body carries `reason`). */
  private async assertReason(
    area: string | null,
    method: string,
    body: unknown,
    context: ExecutionContext,
  ): Promise<void> {
    if (!area || !this.settings || levelForMethod(method) === 'view') return;
    const sent = !!body && typeof body === 'object' && 'reason' in body;
    // A route whose body DTO has a `reason` field counts even when the
    // client left the field out.
    if (!sent && !takesReason(context)) return;
    const reason = sent ? (body as { reason?: unknown }).reason : undefined;
    if (typeof reason === 'string' && reason.trim().length >= REASON_MIN) {
      return;
    }
    const areas = await this.settings.stringList('admin.reason_required_areas');
    if (!areas.includes(area)) return;
    throw new BadRequestException({
      code: ErrorCode.REASON_REQUIRED,
      message: `A reason (at least ${REASON_MIN} characters) is required in this section.`,
      details: { field: 'reason' },
    });
  }

  /** One audit row per action + admin + route per minute (a page
   * refetching in a loop must not flood the log). Fire and forget. */
  private readonly recent = new Map<string, number>();
  private note(
    action: 'admin.access_denied' | 'admin.view',
    adminId: string,
    method: string,
    url: string,
    ip: string | undefined,
  ): void {
    if (!this.audit) return;
    const path = url.split('?')[0];
    const key = `${action} ${adminId} ${method} ${path}`;
    const now = Date.now();
    if ((this.recent.get(key) ?? 0) > now - 60_000) return;
    if (this.recent.size > 5_000) this.recent.clear();
    this.recent.set(key, now);
    void this.audit
      .record({
        adminId,
        action,
        targetType: 'route',
        targetId: null,
        after: { method, path },
        ip: ip ?? null,
      })
      .catch(() => undefined);
  }
}

/**
 * Audit 2026-10-02: browsers refuse non-Latin-1 header values, so the
 * admin UI sends `encodeURIComponent(reason)`. A value with %-escapes is
 * decoded; plain ASCII (older clients, curl) passes as is, and a value
 * that isn't valid percent-encoding is kept verbatim.
 */
export function decodeJustification(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!/%[0-9a-f]{2}/i.test(value)) return value;
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value;
  }
}

/** The decoded `X-Justification` (10–500 chars) or JUSTIFICATION_REQUIRED. */
export function readJustification(raw: string | undefined): string {
  const value = decodeJustification(raw);
  if (value.length < JUSTIFICATION_MIN || value.length > JUSTIFICATION_MAX) {
    throw new BadRequestException({
      code: ErrorCode.JUSTIFICATION_REQUIRED,
      message: `X-Justification header (${JUSTIFICATION_MIN}–${JUSTIFICATION_MAX} characters) is required to view this data.`,
    });
  }
  return value;
}

const unauthorized = (message: string) =>
  new UnauthorizedException({ code: ErrorCode.UNAUTHORIZED, message });

const hidden = () =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });

const forbidden = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Admin role required.',
  });
