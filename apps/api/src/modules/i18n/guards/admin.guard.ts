import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';

/**
 * Route-level guard for the `/admin/i18n/*` endpoints (docs/01_FOUNDATION
 * _AUTH.md §9.3). Runs AFTER the global JwtAuthGuard (route-level guards
 * execute after global ones — same ordering ReauthGuard relies on, see
 * its doc comment), so req.user is already populated: this only adds the
 * role check on top.
 *
 * Deliberately NOT a full RolesGuard/@Roles(...) decorator system —
 * there's exactly one role gate needed anywhere in the backend so far
 * (admin-only), and file 6 ("админка") is where a real admin module with
 * broader RBAC belongs; inventing that generality here would be adding
 * something §9.3 doesn't ask for (.cursorrules: "ничего не добавляй
 * заодно"). If a second admin-gated feature shows up before file 6, this
 * is the natural place to generalize into @Roles().
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Admin role required.',
      });
    }
    return true;
  }
}
