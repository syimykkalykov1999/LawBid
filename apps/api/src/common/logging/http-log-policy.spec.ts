import {
  DEFAULT_HTTP_LOG_POLICY,
  compactReq,
  compactRes,
  httpLogLevel,
  httpLogPolicyFromEnv,
  requestUserProps,
  safeUrl,
} from './http-log-policy';
import type { IncomingMessage } from 'node:http';

const policy = { samplePercent: 1, slowMs: 1000 };

describe('httpLogLevel (owner 2026-10-22, server load audit finding 1)', () => {
  it('always logs failures: an error or 5xx is an error line', () => {
    expect(httpLogLevel(500, 5, false, policy, () => 0.99)).toBe('error');
    expect(httpLogLevel(503, 5, false, policy, () => 0.99)).toBe('error');
    expect(httpLogLevel(200, 5, true, policy, () => 0.99)).toBe('error');
  });

  it('always logs a 4xx as a warning', () => {
    expect(httpLogLevel(400, 5, false, policy, () => 0.99)).toBe('warn');
    expect(httpLogLevel(404, 5, false, policy, () => 0.99)).toBe('warn');
    expect(httpLogLevel(429, 5, false, policy, () => 0.99)).toBe('warn');
  });

  it('always logs a slow request (at or over the threshold)', () => {
    expect(httpLogLevel(200, 1000, false, policy, () => 0.99)).toBe('warn');
    expect(httpLogLevel(200, 4000, false, policy, () => 0.99)).toBe('warn');
    expect(httpLogLevel(200, 999, false, policy, () => 0.99)).toBe('silent');
  });

  it('samples the ordinary requests: 1 % by default', () => {
    expect(httpLogLevel(200, 5, false, policy, () => 0)).toBe('info');
    expect(httpLogLevel(200, 5, false, policy, () => 0.0099)).toBe('info');
    expect(httpLogLevel(200, 5, false, policy, () => 0.01)).toBe('silent');
    expect(httpLogLevel(304, 5, false, policy, () => 0.5)).toBe('silent');
  });

  it('about samplePercent of many requests are kept', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    let kept = 0;
    for (let i = 0; i < 100_000; i++) {
      if (httpLogLevel(200, 5, false, policy, random) !== 'silent') kept++;
    }
    expect(kept).toBeGreaterThan(800);
    expect(kept).toBeLessThan(1200);
  });

  it('0 % logs no ordinary request, 100 % logs every one', () => {
    const none = { samplePercent: 0, slowMs: 1000 };
    const all = { samplePercent: 100, slowMs: 1000 };
    expect(httpLogLevel(200, 5, false, none, () => 0)).toBe('silent');
    expect(httpLogLevel(500, 5, false, none, () => 0)).toBe('error');
    expect(httpLogLevel(200, 5, false, all, () => 0.9999)).toBe('info');
  });
});

describe('httpLogPolicyFromEnv', () => {
  it('defaults: 1 % and 1000 ms', () => {
    expect(httpLogPolicyFromEnv({})).toEqual(DEFAULT_HTTP_LOG_POLICY);
    expect(DEFAULT_HTTP_LOG_POLICY).toEqual({ samplePercent: 1, slowMs: 1000 });
  });

  it('reads HTTP_LOG_SAMPLE_PERCENT and HTTP_LOG_SLOW_MS', () => {
    expect(
      httpLogPolicyFromEnv({
        HTTP_LOG_SAMPLE_PERCENT: '5',
        HTTP_LOG_SLOW_MS: '250',
      }),
    ).toEqual({ samplePercent: 5, slowMs: 250 });
    expect(
      httpLogPolicyFromEnv({ HTTP_LOG_SAMPLE_PERCENT: '0.5' }).samplePercent,
    ).toBe(0.5);
  });

  it('caps at 100 % and ignores junk', () => {
    expect(
      httpLogPolicyFromEnv({ HTTP_LOG_SAMPLE_PERCENT: '250' }).samplePercent,
    ).toBe(100);
    expect(
      httpLogPolicyFromEnv({
        HTTP_LOG_SAMPLE_PERCENT: 'lots',
        HTTP_LOG_SLOW_MS: '-3',
      }),
    ).toEqual(DEFAULT_HTTP_LOG_POLICY);
    expect(httpLogPolicyFromEnv({ HTTP_LOG_SLOW_MS: ' ' }).slowMs).toBe(1000);
  });
});

describe('compact serializers', () => {
  it('safeUrl keeps query names, drops values', () => {
    expect(safeUrl('/api/v1/search/cases?q=divorce+lawyer&page=2')).toBe(
      '/api/v1/search/cases?q&page',
    );
    expect(safeUrl('/api/v1/feed')).toBe('/api/v1/feed');
    expect(safeUrl('/api/v1/feed?')).toBe('/api/v1/feed');
    expect(safeUrl(undefined)).toBeUndefined();
  });

  it('safeUrl redacts secret path parts', () => {
    expect(safeUrl('/api/v1/webhooks/bunny/s3cr3t?x=1')).toBe(
      '/api/v1/webhooks/bunny/[REDACTED]?x',
    );
    expect(safeUrl('/api/v1/admin/auth/invite/tok123')).toBe(
      '/api/v1/admin/auth/invite/[REDACTED]',
    );
    expect(safeUrl('/api/v1/groups/join/AbC_-9')).toBe(
      '/api/v1/groups/join/[REDACTED]',
    );
  });

  it('compactReq has no headers, body, query or address', () => {
    const out = compactReq({
      id: 'r1',
      method: 'POST',
      url: '/api/v1/auth/login?next=/x',
      headers: { authorization: 'Bearer t' },
      body: { password: 'p' },
      remoteAddress: '1.2.3.4',
    } as Parameters<typeof compactReq>[0]);
    expect(out).toEqual({
      id: 'r1',
      method: 'POST',
      url: '/api/v1/auth/login?next',
    });
  });

  it('compactRes is the status only', () => {
    expect(
      compactRes({
        statusCode: 201,
        headers: { 'set-cookie': 'x' },
      } as Parameters<typeof compactRes>[0]),
    ).toEqual({ statusCode: 201 });
  });

  it('requestUserProps: the user id once the guard ran', () => {
    expect(
      requestUserProps({ userId: 'u1' } as IncomingMessage & {
        userId?: unknown;
      }),
    ).toEqual({ userId: 'u1' });
    expect(requestUserProps({} as IncomingMessage)).toEqual({});
  });
});
