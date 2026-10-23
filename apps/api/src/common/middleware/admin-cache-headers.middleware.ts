import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Owner 2026-10-23 (admin economy pass): every GET under /admin is for one
 * signed-in admin — never stored by a shared cache (`private`) — and is
 * revalidated with the ETag Express puts on each JSON answer
 * (`no-cache` = "ask, I may say 304"), so a list that did not change costs
 * a header, not a body. A handler that wants more (`@Header('Cache-Control',
 * 'private, max-age=30')` on the dashboard and the counts) or less
 * (`no-store`) sets its own value, which replaces this default.
 */
@Injectable()
export class AdminCacheHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (req.method === 'GET' && /\/admin(\/|$)/.test(req.path)) {
      res.setHeader('Cache-Control', 'private, no-cache');
      res.vary('Authorization');
    }
    next();
  }
}
