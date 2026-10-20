import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Owner 2026-10-20 (privacy): who is looking at the response being built.
 * FilesService reads it to hide a profile photo from people the owner did
 * not allow, in one place for every list and card (feed, comments, chats,
 * search, calls …). Jobs, sockets and admin requests have no viewer and are
 * not filtered.
 */
class ViewerContext {
  private readonly als = new AsyncLocalStorage<{ userId: string }>();

  viewerId(): string | null {
    return this.als.getStore()?.userId ?? null;
  }

  run<T>(userId: string, fn: () => T): T {
    return this.als.run({ userId }, fn);
  }
}

export const viewerContext = new ViewerContext();

/** Puts the signed-in user (set by JwtAuthGuard) into [viewerContext]. */
@Injectable()
export class ViewerContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const id = req?.user?.sub;
    if (!id) return next.handle();
    return new Observable((subscriber) =>
      viewerContext.run(id, () => next.handle().subscribe(subscriber)),
    );
  }
}
