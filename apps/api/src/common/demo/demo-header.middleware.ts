import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { demoContext, isDemoPassthroughPath, wantsDemo } from './demo-context';

/**
 * Puts a request carrying `X-LawBid-Demo: 1` into the demo world for the
 * rest of its lifetime (guards, interceptors, handlers, Prisma). Reference
 * endpoints (`DEMO_PASSTHROUGH_PREFIXES`) stay on the real database so a
 * demo session still gets translations and countries without the demo
 * world mirroring those tables.
 */
@Injectable()
export class DemoHeaderMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const demo =
      wantsDemo(req.headers) &&
      !isDemoPassthroughPath(req.originalUrl ?? req.url ?? '');
    (req as Request & { demo?: boolean }).demo = demo;
    demoContext.run(demo, () => next());
  }
}
