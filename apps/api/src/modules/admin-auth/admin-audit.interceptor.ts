import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { catchError, from, mergeMap, throwError, type Observable } from 'rxjs';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { routeArea } from './admin-permissions';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AUDIT_ACTION_KEY,
  JUSTIFICATION_KEY,
  PRIVATE_READ_KEY,
  SKIP_AUTO_AUDIT_KEY,
  STRICT_AUDIT_KEY,
  type RequestAdmin,
} from './admin-auth.decorators';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_MAX_CHARS = 4000;
const SECRET_KEYS = /token|code|secret|password|recovery|answer|question/i;

/** Sections whose every action is audited fail-closed (owner 2026-10-28):
 * money, keys, admin accounts and sessions, government data requests,
 * exports, the audit log itself. Individual routes opt in with
 * @StrictAudit() / @PrivateRead(). */
const STRICT_AREAS: ReadonlySet<string> = new Set([
  'money',
  'payroll',
  'keys',
  'admins',
  'sessions',
  'data_requests',
  'exports',
  'audit',
]);

/**
 * docs/06 §2.1 "Все действия администраторов пишутся в audit_log": a
 * generic row for every successful mutating admin request and every
 * @Justification() view. Handlers whose service already records a richer
 * row (before/after of the changed entity) opt out with @SkipAutoAudit()
 * so an action is never logged twice.
 *
 * Owner 2026-10-28 (fail closed): on a SENSITIVE route (STRICT_AREAS,
 * @StrictAudit(), @PrivateRead()) the row is written BEFORE the handler
 * runs; if it cannot be written the action does not run and the caller
 * gets 503 AUDIT_UNAVAILABLE. Elsewhere a failed audit write is logged
 * and the (already committed) action still answers, as before.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminAuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const targets = [context.getHandler(), context.getClass()];
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_AUTO_AUDIT_KEY,
      targets,
    );
    const req = context
      .switchToHttp()
      .getRequest<Request & { admin?: RequestAdmin }>();
    const privateKind = this.reflector.getAllAndOverride<string | undefined>(
      PRIVATE_READ_KEY,
      targets,
    );
    const isView =
      req.method === 'GET' &&
      (!!privateKind ||
        !!this.reflector.getAllAndOverride<boolean>(
          JUSTIFICATION_KEY,
          targets,
        ));
    if (skip || !req.admin || (req.method === 'GET' && !isView)) {
      return next.handle();
    }
    const admin = req.admin;
    const name = privateKind
      ? `private_read.${privateKind}`
      : (this.reflector.get<string | undefined>(
          AUDIT_ACTION_KEY,
          context.getHandler(),
        ) ?? `${req.method.toLowerCase()} ${routeOf(req)}`);
    const strict =
      !!this.reflector.getAllAndOverride<boolean>(STRICT_AUDIT_KEY, targets) ||
      STRICT_AREAS.has(routeArea(req.originalUrl || req.url) ?? '');
    const row = (after: Prisma.InputJsonValue | null) => ({
      adminId: admin.id,
      action: `admin.${name}`,
      targetType: targetTypeOf(req),
      targetId: targetIdOf(req),
      after,
      ip: req.ip ?? null,
      justification: admin.justification,
      reasonCode: admin.reasonCode ?? null,
    });
    const failedRow = async (error: unknown) => {
      const status =
        typeof (error as { getStatus?: () => number }).getStatus === 'function'
          ? (error as { getStatus: () => number }).getStatus()
          : 500;
      try {
        await this.audit.record(row({ outcome: 'failed', status }));
      } catch (e) {
        this.logger.error(`audit_log write failed: ${String(e)}`);
      }
    };

    if (strict) {
      return from(
        this.audit
          .record(row(isView ? null : scrubBody(req.body)))
          .catch((e: unknown) => {
            this.logger.error(`audit_log write failed (refused): ${String(e)}`);
            throw new ServiceUnavailableException({
              code: ErrorCode.AUDIT_UNAVAILABLE,
              message:
                'The action was refused because it could not be written to the audit log.',
            });
          }),
      ).pipe(
        mergeMap(() => next.handle()),
        catchError((error: unknown) =>
          from(failedRow(error)).pipe(mergeMap(() => throwError(() => error))),
        ),
      );
    }

    // Awaited (not fire-and-forget): the row must exist when the response
    // leaves — "каждое действие есть в audit_log" is checked right after.
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        try {
          await this.audit.record(row(isView ? null : scrubBody(req.body)));
        } catch (e) {
          this.logger.error(`audit_log write failed: ${String(e)}`);
        }
        return body;
      }),
      // Security review: denied / failed privileged calls leave a row too
      // (`outcome: failed` + HTTP status), so the trail cannot be emptied
      // by making an action fail.
      catchError((error: unknown) =>
        from(failedRow(error)).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}

/** `/api/v1/admin/admins/:id/disable` → `admin/admins/:id/disable`. */
function routeOf(req: Request): string {
  const path = (req.route as { path?: string } | undefined)?.path ?? req.path;
  return path.replace(/^\/api\/v\d+\//, '').replace(/^\//, '');
}

function targetTypeOf(req: Request): string {
  const seg = routeOf(req).split('/')[1] ?? 'admin';
  return seg.replace(/-/g, '_');
}

function targetIdOf(req: Request): string | null {
  const params = req.params as Record<string, string | undefined>;
  const id =
    params.id ?? Object.values(params).find((v) => v && UUID_RE.test(v));
  return id && UUID_RE.test(id) ? id : null;
}

function scrubBody(body: unknown): Prisma.InputJsonValue | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? '[redacted]' : v;
  }
  const json = JSON.stringify(out);
  if (json.length > BODY_MAX_CHARS) {
    return { truncated: true, bytes: json.length };
  }
  return out as Prisma.InputJsonValue;
}
