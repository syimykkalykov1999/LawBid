import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { SloMetricsService } from '../ops/slo-metrics.service';
import {
  LoadShedException,
  LoadSheddingGuard,
  LoadSheddingMiddleware,
  LoadSheddingService,
  SHED_DEFAULTS,
  shedReason,
} from './load-shedding';
import { SHED_PRIORITY_KEY, type ShedPriorityLevel } from './shed-priority';

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

function runMiddleware(path: string, service: LoadSheddingService) {
  const handlers: Record<string, () => void> = {};
  const res = {
    once: jest.fn((ev: string, fn: () => void) => {
      handlers[ev] = fn;
    }),
  };
  const next = jest.fn();
  const req = { path, method: 'GET', headers: {} } as unknown as Request;
  new LoadSheddingMiddleware(service).use(
    req,
    res as unknown as Response,
    next as NextFunction,
  );
  return { req, next, handlers };
}

function ctxFor(req: Request, level?: ShedPriorityLevel): ExecutionContext {
  class Ctl {}
  const handler = () => undefined;
  if (level) Reflect.defineMetadata(SHED_PRIORITY_KEY, level, handler);
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => Ctl,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function guardRun(
  svc: LoadSheddingService,
  path: string,
  level?: ShedPriorityLevel,
  headers: Record<string, string> = {},
) {
  const { req } = runMiddleware(path, svc);
  (req as { headers: Record<string, string> }).headers = headers;
  const guard = new LoadSheddingGuard(svc, new Reflector());
  try {
    return { ok: guard.canActivate(ctxFor(req, level)), error: null };
  } catch (e) {
    return { ok: false, error: e as LoadShedException };
  }
}

describe('LoadSheddingMiddleware', () => {
  it('counts requests in flight and releases them once', () => {
    const svc = new LoadSheddingService();
    const { handlers, next } = runMiddleware('/api/v1/cases', svc);
    expect(next).toHaveBeenCalled();
    expect(svc.inFlight).toBe(1);
    handlers.finish();
    handlers.close();
    expect(svc.inFlight).toBe(0);
  });

  it('feeds the adaptive limit with the time of served requests only (Авто)', () => {
    const svc = new LoadSheddingService();
    const spy = jest.spyOn(svc.gradient, 'update');
    runMiddleware('/api/v1/cases', svc).handlers.finish();
    expect(spy).toHaveBeenCalledTimes(1);
    runMiddleware('/api/v1/cases', svc).handlers.close();
    expect(spy).toHaveBeenCalledTimes(1);
    svc.applySettings({ ...SHED_DEFAULTS, mode: 'on' });
    runMiddleware('/api/v1/cases', svc).handlers.finish();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not count health checks and webhooks', () => {
    const svc = new LoadSheddingService();
    runMiddleware('/health/live', svc);
    runMiddleware('/api/v1/webhooks/stripe', svc);
    expect(svc.inFlight).toBe(0);
  });
});

describe('LoadSheddingGuard (item 21, prioritized shedding)', () => {
  const slo = () => ({ count: jest.fn() });

  it('answers 503 SERVER_BUSY with Retry-After and notProcessed when overloaded', () => {
    const svc = new LoadSheddingService();
    svc.lagMs = 900;
    const { error } = guardRun(svc, '/api/v1/cases');
    expect(error).toBeInstanceOf(LoadShedException);
    expect(error!.getStatus()).toBe(503);
    const body = error!.getResponse() as {
      code: string;
      details: {
        retryAfterSeconds: number;
        priority: string;
        notProcessed: boolean;
      };
    };
    expect(body.code).toBe('SERVER_BUSY');
    expect(body.details.priority).toBe('degraded');
    expect(body.details.notProcessed).toBe(true);
    expect(body.details.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(body.details.retryAfterSeconds).toBeLessThanOrEqual(5);
    expect(svc.shed).toBe(1);
  });

  it('sheds background and prefetch first while sign-in, payments and sending pass', () => {
    const counter = slo();
    const svc = new LoadSheddingService(
      undefined,
      counter as unknown as SloMetricsService,
    );
    svc.applySettings({ ...SHED_DEFAULTS, mode: 'on' });
    svc.cpuPct = 85; // above start (75), below critical (95)
    expect(guardRun(svc, '/api/v1/app-events', 'bulk').error).not.toBeNull();
    expect(
      guardRun(svc, '/api/v1/link-preview', 'best_effort').error,
    ).not.toBeNull();
    expect(guardRun(svc, '/api/v1/auth/login', 'critical').ok).toBe(true);
    expect(guardRun(svc, '/api/v1/feed').ok).toBe(true);
    // The app marked a feed call as prefetch: it waits.
    expect(
      guardRun(svc, '/api/v1/feed', undefined, {
        'x-request-priority': 'prefetch',
      }).error,
    ).not.toBeNull();
    expect(counter.count).toHaveBeenCalledWith('shedLow');
    expect(counter.count).not.toHaveBeenCalledWith('shedCritical');
    svc.cpuPct = 99;
    expect(
      guardRun(svc, '/api/v1/auth/login', 'critical').error,
    ).not.toBeNull();
    expect(counter.count).toHaveBeenCalledWith('shedCritical');
  });

  it('never sheds health checks, webhooks or the token refresh', () => {
    const svc = new LoadSheddingService();
    svc.lagMs = 9000;
    svc.cpuPct = 100;
    for (const path of [
      '/health/live',
      '/api/v1/webhooks/stripe',
      '/api/v1/auth/refresh',
    ]) {
      expect(guardRun(svc, path).ok).toBe(true);
    }
    expect(svc.shed).toBe(0);
  });

  it('Выкл lets everything through, whatever the load', () => {
    const svc = new LoadSheddingService();
    svc.applySettings({ ...SHED_DEFAULTS, mode: 'off' });
    svc.lagMs = 9000;
    expect(guardRun(svc, '/api/v1/app-events', 'bulk').ok).toBe(true);
  });

  it('a normal instance lets everything through', () => {
    const svc = new LoadSheddingService();
    expect(guardRun(svc, '/api/v1/app-events', 'bulk').ok).toBe(true);
    expect(guardRun(svc, '/api/v1/cases').ok).toBe(true);
  });

  it('Вкл: a fixed in-flight limit sheds bulk at 70 % and critical only at the limit', () => {
    const svc = new LoadSheddingService();
    svc.applySettings({ ...SHED_DEFAULTS, mode: 'on', maxInFlight: 10 });
    svc.inFlight = 7;
    expect(guardRun(svc, '/api/v1/app-events', 'bulk').error).not.toBeNull();
    expect(guardRun(svc, '/api/v1/auth/login', 'critical').ok).toBe(true);
    svc.inFlight = 10;
    expect(
      guardRun(svc, '/api/v1/auth/login', 'critical').error,
    ).not.toBeNull();
  });

  it('Retry-After follows the admin maximum', () => {
    const svc = new LoadSheddingService();
    svc.applySettings({ ...SHED_DEFAULTS, retryAfterMaxSec: 1 });
    for (let i = 0; i < 20; i++) expect(svc.retryAfterSec()).toBe(1);
  });
});

describe('LoadSheddingService settings and metric line', () => {
  it('reads every threshold and the mode from the admin settings', async () => {
    const stored: Record<string, unknown> = {
      'realtime.server.shed_mode': 'on',
      'realtime.server.shed_event_loop_lag_ms': 800,
      'realtime.server.shed_lag_start_ms': 100,
      'realtime.server.shed_cpu_critical_pct': 90,
      'realtime.server.shed_cpu_start_pct': 60,
      'realtime.server.shed_in_flight_start_pct': 50,
      'realtime.server.shed_max_in_flight': 40,
      'realtime.server.shed_auto_min_limit': 10,
      'realtime.server.shed_auto_max_limit': 50,
      'realtime.server.shed_retry_after_max_seconds': 9,
    };
    const settings = {
      raw: jest.fn((k: string) => Promise.resolve(stored[k])),
      number: jest.fn((k: string) => Promise.resolve(stored[k] as number)),
    };
    const svc = new LoadSheddingService(
      settings as unknown as AppSettingsService,
    );
    await svc.loadLimits();
    expect(svc.settings).toEqual({
      mode: 'on',
      lagCriticalMs: 800,
      lagStartMs: 100,
      cpuCriticalPct: 90,
      cpuStartPct: 60,
      inFlightStartPct: 50,
      maxInFlight: 40,
      autoMinLimit: 10,
      autoMaxLimit: 50,
      retryAfterMaxSec: 9,
    });
    expect(svc.currentLimit()).toBe(40);
  });

  it('Авто uses the adaptive limit, capped by the fixed one when set', () => {
    const svc = new LoadSheddingService();
    expect(svc.currentLimit()).toBe(svc.gradient.limit);
    svc.applySettings({ ...SHED_DEFAULTS, maxInFlight: 5 });
    expect(svc.currentLimit()).toBe(5);
  });

  it('writes one warn line a minute only while something was shed', () => {
    const logger = { warn: jest.fn() };
    const svc = new LoadSheddingService(
      undefined,
      undefined,
      logger as unknown as PinoLogger,
    );
    expect(svc.flushMinute()).toBeNull();
    svc.recordShed('bulk');
    svc.recordShed('bulk');
    svc.recordShed('critical');
    expect(svc.flushMinute()).toEqual({
      bulk: 2,
      best_effort: 0,
      degraded: 0,
      critical: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'load_shed' }),
      expect.any(String),
    );
    expect(svc.flushMinute()).toBeNull();
  });
});
