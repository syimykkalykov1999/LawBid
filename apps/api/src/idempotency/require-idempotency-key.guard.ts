import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '../common/errors/error-code.enum';

/**
 * Makes the Idempotency-Key header mandatory on a route (400
 * IDEMPOTENCY_KEY_REQUIRED). Pair with IdempotencyInterceptor, which only
 * handles replay when a key is present — used where the spec demands an
 * idempotent submission (e.g. docs/03 §7.2 "Отправка отзыва идемпотентна").
 */
@Injectable()
export class RequireIdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.header('idempotency-key');
    if (!key || key.trim() === '') {
      throw new BadRequestException({
        code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        message: 'This request requires an Idempotency-Key header.',
      });
    }
    return true;
  }
}
