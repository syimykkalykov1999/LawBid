import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AUDIT_ACTION_KEY,
  JUSTIFICATION_KEY,
  SKIP_AUTO_AUDIT_KEY,
  type RequestAdmin,
} from './admin-auth.decorators';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_MAX_CHARS = 4000;
const SECRET_KEYS = /token|code|secret|password|recovery/i;

/**
 * docs/06 §2.1 "Все действия администраторов пишутся в audit_log": a
 * generic row for every successful mutating admin request and every
 * @Justification() view. Handlers whose service already records a richer
 * row (before/after of the changed entity) opt out with @SkipAutoAudit()
 * so an action is never logged twice. Failures of the audit write are
 * logged, not surfaced — the action itself already committed.
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
    const isView =
      req.method === 'GET' &&
      this.reflector.getAllAndOverride<boolean>(JUSTIFICATION_KEY, targets);
    if (skip || !req.admin || (req.method === 'GET' && !isView)) {
      return next.handle();
    }
    const admin = req.admin;
    const name =
      this.reflector.get<string | undefined>(
        AUDIT_ACTION_KEY,
        context.getHandler(),
      ) ?? `${req.method.toLowerCase()} ${routeOf(req)}`;
    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit
            .record({
              adminId: admin.id,
              action: `admin.${name}`,
              targetType: targetTypeOf(req),
              targetId: targetIdOf(req),
              after: isView ? null : scrubBody(req.body),
              ip: req.ip ?? null,
              justification: admin.justification,
            })
            .catch((e: unknown) =>
              this.logger.error(`audit_log write failed: ${String(e)}`),
            );
        },
      }),
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
