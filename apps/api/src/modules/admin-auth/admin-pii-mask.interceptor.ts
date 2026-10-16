import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import type { RequestAdmin } from './admin-auth.decorators';
import { maskPii } from './admin-pii-mask';

/** Masks personal fields in every response to an admin who carries the
 * «без персональных данных» flag (owner 2026-10-16). Everyone else passes
 * through untouched. */
@Injectable()
export class AdminPiiMaskInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { admin?: RequestAdmin }>();
    if (!req.admin?.noPii) return next.handle();
    return next.handle().pipe(map((body) => maskPii(body)));
  }
}
