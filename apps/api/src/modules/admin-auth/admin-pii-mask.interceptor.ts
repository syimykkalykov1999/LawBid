import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Optional,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, map, mergeMap, type Observable } from 'rxjs';
import {
  STAFF_SECURITY,
  type StaffSecurityPort,
} from '../staff-core/staff-security.port';
import type { RequestAdmin } from './admin-auth.decorators';
import { maskPii, maskPiiPartial } from './admin-pii-mask';

/**
 * Masks personal fields in every response to an admin who carries the
 * «без персональных данных» flag (owner 2026-10-16): everything is masked.
 * Staff package T11: the mass-work workspace gets the PARTIAL mask while
 * `staff.masking_enabled` is on (phone / e-mail / document numbers
 * shortened, payment fields removed), and its exports are closed
 * (`staff.export_block_enabled`). Everyone else passes through untouched.
 */
@Injectable()
export class AdminPiiMaskInterceptor implements NestInterceptor {
  constructor(
    @Optional()
    @Inject(STAFF_SECURITY)
    private readonly security?: StaffSecurityPort,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { admin?: RequestAdmin }>();
    const admin = req.admin;
    if (admin?.noPii) return next.handle().pipe(map((body) => maskPii(body)));
    const security = this.security;
    if (!admin || !security) return next.handle();
    return from(
      (async () => {
        await security.beforeHandler(req, admin);
        return security.maskMode(admin);
      })(),
    ).pipe(
      mergeMap((mode) =>
        mode === 'partial'
          ? next.handle().pipe(map((body) => maskPiiPartial(body)))
          : next.handle(),
      ),
    );
  }
}
