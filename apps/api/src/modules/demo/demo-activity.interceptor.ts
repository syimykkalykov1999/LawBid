import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { DemoService } from './demo.service';

/** Remembers the last use of a demo account (for the TTL sweep). Runs
 * after the guards, so `req.user` is the verified demo claims. */
@Injectable()
export class DemoActivityInterceptor implements NestInterceptor {
  constructor(private readonly demo: DemoService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      const req = ctx
        .switchToHttp()
        .getRequest<Request & { user?: RequestUser }>();
      const user = req.user;
      if (user?.demo === true) {
        const id = user.assistant?.userId ?? user.sub;
        void this.demo.touch(id);
      }
    }
    return next.handle();
  }
}
