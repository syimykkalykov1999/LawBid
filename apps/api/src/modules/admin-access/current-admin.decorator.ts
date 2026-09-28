import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestAdmin } from './admin-roles.guard';

/** The admin resolved by AdminRolesGuard, plus the client IP for
 * audit_log. */
export interface AdminActor extends RequestAdmin {
  ip: string | null;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminActor => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { admin?: RequestAdmin }>();
    if (!req.admin) {
      throw new Error('CurrentAdmin used on a route without AdminRolesGuard');
    }
    return { ...req.admin, ip: req.ip ?? null };
  },
);
