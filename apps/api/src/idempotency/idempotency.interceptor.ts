import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { REDIS_CLIENT } from '../redis/redis.constants';

const TTL_SECONDS = 24 * 60 * 60; // 24h replay window
const HEADER = 'idempotency-key';

/**
 * docs/06_PRODUCTION.md §12 (.cursorrules): "Все POST, создающие
 * ресурс/деньги: Idempotency-Key." Apply this interceptor (via
 * `@UseInterceptors(IdempotencyInterceptor)`) on those routes only — it is
 * opt-in per-route, not global, since GET/list endpoints and non-mutating
 * POSTs don't need it. Keys the cached response by
 * `<userId-or-anon>:<route>:<Idempotency-Key>` so the same key on a
 * different route/user can't collide. First request executes normally and
 * caches {status, body}; a repeat with the same key replays the cached
 * response byte-for-byte instead of re-running the handler.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header(HEADER);

    if (!key) {
      // Enforcement (400 IDEMPOTENCY_KEY_REQUIRED) belongs to the route's
      // DTO/guard for stage 1.2's scope — this interceptor only handles the
      // replay behavior when a key IS present, to stay a single-purpose unit.
      return next.handle();
    }

    const userId = (req as { userId?: string }).userId ?? 'anon';
    const cacheKey = `idempotency:${userId}:${req.method}:${req.originalUrl}:${key}`;

    return from(this.redis.get(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached) {
          const { status, body } = JSON.parse(cached) as {
            status: number;
            body: unknown;
          };
          res.status(status);
          return of(body);
        }
        return next.handle().pipe(
          tap((body: unknown) => {
            const status = res.statusCode;
            void this.redis.set(
              cacheKey,
              JSON.stringify({ status, body }),
              'EX',
              TTL_SECONDS,
            );
          }),
        );
      }),
    );
  }
}
