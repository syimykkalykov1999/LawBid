import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { heavyContext } from './heavy-hitters.context';
import { HeavyHittersService } from './heavy-hitters.service';

interface RequestLike {
  route?: { path?: unknown };
  params?: Record<string, unknown>;
  user?: { sub?: unknown };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_ROUTE = /\/cases\/:id(?:\/|$)/;

/** The case a request is about, from the route only (no body, no query). */
export function caseIdOf(req: RequestLike): string | null {
  const p = req.params ?? {};
  const byParam = p.caseId;
  if (typeof byParam === 'string' && UUID.test(byParam)) return byParam;
  const path = typeof req.route?.path === 'string' ? req.route.path : '';
  if (CASE_ROUTE.test(path) && typeof p.id === 'string' && UUID.test(p.id)) {
    return p.id;
  }
  return null;
}

/**
 * WP-G: counts one sampled request (and the database time it used) against
 * the signed-in user and the case it is about. Unsampled requests cost one
 * random number and nothing else.
 */
@Injectable()
export class HeavyHittersInterceptor implements NestInterceptor {
  constructor(private readonly heavy: HeavyHittersService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http' || !this.heavy.shouldSample()) {
      return next.handle();
    }
    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const user = typeof req.user?.sub === 'string' ? req.user.sub : null;
    const caseId = caseIdOf(req);
    if (!user && !caseId) return next.handle();
    const store = { dbMs: 0 };
    const w = this.heavy.sampleWeight;
    return new Observable((subscriber) =>
      heavyContext.run(store, () =>
        next
          .handle()
          .pipe(
            finalize(() => {
              this.heavy.record('requests', 'user', user, w);
              this.heavy.record('requests', 'case', caseId, w);
              this.heavy.record('db_ms', 'user', user, store.dbMs * w);
              this.heavy.record('db_ms', 'case', caseId, store.dbMs * w);
            }),
          )
          .subscribe(subscriber),
      ),
    );
  }
}
