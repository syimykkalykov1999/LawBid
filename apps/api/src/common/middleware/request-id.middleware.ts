import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';

/** A client-supplied id is echoed into logs and response headers, so it
 * must not carry log-injection payloads (newlines, control chars) or be
 * unbounded — anything else is replaced by a fresh UUID. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * The one place a request id is decided. Called by BOTH pino-http's
 * `genReqId` (app.module.ts) and RequestIdMiddleware: Nest does not
 * guarantee which of the two middlewares runs first (nestjs-pino
 * registers its own in LoggerModule), so whichever runs first decides and
 * writes the id back onto the request header; the second one then reads
 * the same value. Result: the pino `req.id` in every request log line ==
 * the `X-Request-Id` response header == `error.requestId` in error bodies
 * (docs/01_FOUNDATION_AUTH.md §7).
 */
export function resolveRequestId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const raw = req.headers[HEADER];
  const incoming = Array.isArray(raw) ? raw[0] : raw;
  const requestId =
    incoming !== undefined && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  req.headers[HEADER] = requestId;
  if (!res.headersSent) res.setHeader('X-Request-Id', requestId);
  return requestId;
}

/** docs/01_FOUNDATION_AUTH.md §7: every request gets X-Request-Id (generated
 * if absent), written to logs and echoed on the response and in error bodies. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    resolveRequestId(req, res);
    next();
  }
}

export function getRequestId(req: Request): string {
  const value = req.headers[HEADER];
  return Array.isArray(value) ? value[0] : (value ?? 'unknown');
}
