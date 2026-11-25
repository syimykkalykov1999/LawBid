import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import type { HttpStatsService } from './http-stats.service';
import { HttpStatsMiddleware } from './http-stats.service';
import type { SloMetricsService } from './slo-metrics.service';

/** Б2 (25.11): every answered request and its 5xx go into the minute
 * `{metric:"slo", release}` line, so scripts/deploy/canary.sh can compare the
 * canary release with the control (SRE Workbook ch. 16). */
describe('HttpStatsMiddleware → canary counters', () => {
  const run = (path: string, status: number) => {
    const stats = { record: jest.fn() };
    const slo = { count: jest.fn() };
    const mw = new HttpStatsMiddleware(
      stats as unknown as HttpStatsService,
      undefined,
      slo as unknown as SloMetricsService,
    );
    const res = Object.assign(new EventEmitter(), { statusCode: status });
    const next: NextFunction = jest.fn();
    mw.use(
      { path, method: 'GET' } as unknown as Request,
      res as unknown as Response,
      next,
    );
    res.emit('finish');
    return { slo, stats, next };
  };

  it('counts a request and its 5xx', () => {
    const { slo } = run('/api/v1/feed', 503);
    expect(slo.count).toHaveBeenCalledWith('httpReq');
    expect(slo.count).toHaveBeenCalledWith('http5xx');
  });

  it('a 4xx is a request, not a 5xx', () => {
    const { slo } = run('/api/v1/feed', 404);
    expect(slo.count.mock.calls).toEqual([['httpReq']]);
  });

  it('load balancer probes are not counted', () => {
    const { slo, next } = run('/health/ready', 200);
    expect(slo.count).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
