import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';

/** docs/01_FOUNDATION_AUTH.md §7: every request gets X-Request-Id (generated
 * if absent), written to logs and echoed on the response and in error bodies. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(HEADER);
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    req.headers[HEADER] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}

export function getRequestId(req: Request): string {
  const value = req.headers[HEADER];
  return Array.isArray(value) ? value[0] : (value ?? 'unknown');
}
