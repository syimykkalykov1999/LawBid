import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { ApiSuccessBody } from '../dto/api-response.dto';

/**
 * docs/01_FOUNDATION_AUTH.md §7: success format is
 *   { "data": ..., "meta": { "nextCursor": "..." } }
 * A handler returns either a plain payload (wrapped as-is into `data`) or
 * an object already shaped like `{ items, nextCursor }` for paginated
 * list endpoints, which this unwraps into `{ data: items, meta: { nextCursor } }`.
 * Health/Swagger routes are excluded (see main.ts) since Terminus/Swagger
 * have their own response shapes mandated by their tooling.
 *
 * Owner 2026-10-28: a route marked `@LegalDisclaimerNotice` leaves the
 * notice on the request (`req.legalDisclaimer`); it goes to `meta.disclaimer`.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessBody<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessBody<T>> {
    return next.handle().pipe(
      map((payload) => {
        const disclaimer = this.disclaimerOf(context);
        if (
          payload !== null &&
          typeof payload === 'object' &&
          'items' in (payload as Record<string, unknown>) &&
          'nextCursor' in (payload as Record<string, unknown>)
        ) {
          const { items, nextCursor, ...rest } = payload as unknown as {
            items: unknown;
            nextCursor: string | null;
            [k: string]: unknown;
          };
          return {
            data: items as T,
            meta: {
              nextCursor,
              ...rest,
              ...(disclaimer ? { disclaimer } : {}),
            },
          };
        }
        return disclaimer
          ? { data: payload, meta: { disclaimer } }
          : { data: payload };
      }),
    );
  }

  private disclaimerOf(context: ExecutionContext): unknown {
    try {
      const req = context.switchToHttp().getRequest<{
        legalDisclaimer?: unknown;
      }>();
      return req?.legalDisclaimer;
    } catch {
      return undefined;
    }
  }
}
