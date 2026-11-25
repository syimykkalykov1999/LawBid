import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  DEADLINE_HEADER,
  RequestDeadlineError,
  parseDeadlineHeader,
  runWithDeadline,
} from './request-deadline';

/** Only reads take part (request-deadline.ts): a write runs to the end. */
const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** How long the switch value is reused before it is read again. */
const SWITCH_REFRESH_MS = 30_000;

/**
 * Stage 2 SRE (Б5): opens the deadline scope of a read that carries
 * `X-Request-Timeout-Ms` (see request-deadline.ts) and fires its signal when
 * the deadline passes or the app hangs up first (`res` «close» before
 * «finish», Node HTTP docs). The answer going out ends the scope.
 */
@Injectable()
export class RequestDeadlineMiddleware implements NestMiddleware {
  private enabled = true;
  private readAt = 0;
  private readonly ceilingMs: number;

  constructor(
    @Optional() config?: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    const c = Number(config?.get<number>('REQUEST_TIMEOUT_MS'));
    this.ceilingMs = Number.isFinite(c) && c > 0 ? c : 30_000;
  }

  /** The admin switch, re-read at most every 30 s (no wait per request). */
  private switchOn(): boolean {
    const now = Date.now();
    if (this.settings && now - this.readAt > SWITCH_REFRESH_MS) {
      this.readAt = now;
      this.settings
        .boolean('client.deadline_header_enabled')
        .then((v) => {
          this.enabled = v;
        })
        .catch(() => undefined);
    }
    return this.enabled;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (!SAFE_METHODS.has(req.method)) return next();
    const ms = parseDeadlineHeader(
      req.headers[DEADLINE_HEADER],
      this.ceilingMs,
    );
    if (ms === null || !this.switchOn()) return next();
    const { controller, end } = runWithDeadline(ms, () => {
      next();
    });
    res.once('finish', end);
    res.once('close', () => {
      if (!res.writableFinished) {
        controller.abort(new RequestDeadlineError('client_closed'));
      }
    });
  }
}
