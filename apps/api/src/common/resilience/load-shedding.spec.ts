import type { NextFunction, Request, Response } from 'express';
import {
  LoadSheddingMiddleware,
  LoadSheddingService,
  shedReason,
} from './load-shedding';

describe('shedReason (owner 2026-10-23)', () => {
  const on = { eventLoopLagMs: 500, maxInFlight: 100 };
  it('sheds on event-loop lag or too many requests, only when the limit is on', () => {
    expect(shedReason(on, 100, 10)).toBeNull();
    expect(shedReason(on, 501, 10)).toBe('event_loop_lag');
    expect(shedReason(on, 10, 100)).toBe('in_flight');
    expect(
      shedReason({ eventLoopLagMs: 0, maxInFlight: 0 }, 9999, 9999),
    ).toBeNull();
  });
});

describe('LoadSheddingMiddleware', () => {
  function run(path: string, service: LoadSheddingService) {
    const handlers: Record<string, () => void> = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      once: jest.fn((ev: string, fn: () => void) => {
        handlers[ev] = fn;
      }),
    };
    const next = jest.fn();
    new LoadSheddingMiddleware(service).use(
      { path } as Request,
      res as unknown as Response,
      next as NextFunction,
    );
    return { res, next, handlers };
  }

  it('answers 503 SERVER_BUSY with Retry-After when overloaded', () => {
    const svc = new LoadSheddingService();
    svc.lagMs = 900;
    const { res, next } = run('/api/v1/cases', svc);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    const retry = Number((res.set.mock.calls[0] as [string, string])[1]);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(5);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'SERVER_BUSY' }),
      }),
    );
    expect(svc.shed).toBe(1);
  });

  it('never sheds health checks, webhooks or the token refresh', () => {
    const svc = new LoadSheddingService();
    svc.lagMs = 9000;
    for (const path of [
      '/health/live',
      '/api/v1/webhooks/stripe',
      '/api/v1/auth/refresh',
    ]) {
      const { next } = run(path, svc);
      expect(next).toHaveBeenCalled();
    }
    expect(svc.shed).toBe(0);
  });

  it('counts requests in flight and releases them once', () => {
    const svc = new LoadSheddingService();
    const { handlers } = run('/api/v1/cases', svc);
    expect(svc.inFlight).toBe(1);
    handlers.finish();
    handlers.close();
    expect(svc.inFlight).toBe(0);
  });

  it('a normal instance lets everything through', () => {
    const svc = new LoadSheddingService();
    const { next } = run('/api/v1/cases', svc);
    expect(next).toHaveBeenCalled();
  });
});
