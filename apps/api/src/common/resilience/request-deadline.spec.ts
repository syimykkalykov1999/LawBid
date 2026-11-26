import { EventEmitter } from 'node:events';
import type { ArgumentsHost } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type {
  NextFunction,
  Request,
  Response as ExpressResponse,
} from 'express';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import {
  installDeadlineFetch,
  resetDeadlineFetchForTest,
} from '../http/outbound-agent';
import { requestDeadlineExtension } from '../../prisma/request-deadline.extension';
import {
  RequestDeadlineError,
  STATEMENT_TIMEOUT_CEILING_MS,
  currentDeadlineSignal,
  deadlineStatementTimeoutMs,
  parseDeadlineHeader,
  runWithDeadline,
  throwIfDeadlinePassed,
} from './request-deadline';
import { RequestDeadlineMiddleware } from './request-deadline.middleware';

/** A response that can finish or be closed by the client. */
function fakeRes(): ExpressResponse & { finish(): void; hangUp(): void } {
  const ee = new EventEmitter() as unknown as ExpressResponse & {
    finish(): void;
    hangUp(): void;
    writableFinished: boolean;
  };
  ee.writableFinished = false;
  ee.finish = () => {
    ee.writableFinished = true;
    ee.emit('finish');
    ee.emit('close');
  };
  ee.hangUp = () => ee.emit('close');
  return ee;
}

function fakeReq(method: string, header?: string): Request {
  return {
    method,
    headers: header === undefined ? {} : { 'x-request-timeout-ms': header },
  } as unknown as Request;
}

/** Runs the middleware and gives back what the handler saw. */
function through(
  mw: RequestDeadlineMiddleware,
  req: Request,
  res: ExpressResponse,
): { signal: AbortSignal | undefined } {
  const seen: { signal: AbortSignal | undefined } = { signal: undefined };
  const next: NextFunction = () => {
    seen.signal = currentDeadlineSignal();
  };
  mw.use(req, res, next);
  return seen;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('request deadline (Stage 2 SRE Б5, SRE ch. 22 deadline propagation)', () => {
  it('parses the header: whole positive ms, capped at the server ceiling', () => {
    expect(parseDeadlineHeader('8000', 30_000)).toBe(8000);
    expect(parseDeadlineHeader(['200'], 30_000)).toBe(200);
    expect(parseDeadlineHeader('999999', 30_000)).toBe(30_000);
    for (const bad of [undefined, '', '0', '-5', '1.5', 'abc', '1e3']) {
      expect(parseDeadlineHeader(bad, 30_000)).toBeNull();
    }
  });

  it('a GET with the header gets a signal that fires at the deadline', async () => {
    const mw = new RequestDeadlineMiddleware();
    const { signal } = through(mw, fakeReq('GET', '30'), fakeRes());
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
    await sleep(60);
    expect(signal!.aborted).toBe(true);
    expect(signal!.reason).toBeInstanceOf(RequestDeadlineError);
  });

  it('the app hanging up first stops the work at once', () => {
    const mw = new RequestDeadlineMiddleware();
    const res = fakeRes();
    const { signal } = through(mw, fakeReq('GET', '8000'), res);
    res.hangUp();
    expect(signal!.aborted).toBe(true);
    expect((signal!.reason as RequestDeadlineError).reason).toBe(
      'client_closed',
    );
  });

  it('an answer that went out is never stopped afterwards', async () => {
    const mw = new RequestDeadlineMiddleware();
    const res = fakeRes();
    const { signal } = through(mw, fakeReq('GET', '20'), res);
    res.finish();
    await sleep(40);
    expect(signal!.aborted).toBe(false);
  });

  it('writes, requests without the header and the admin switch off are untouched', async () => {
    const mw = new RequestDeadlineMiddleware();
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(through(mw, fakeReq(m, '10'), fakeRes()).signal).toBeUndefined();
    }
    expect(through(mw, fakeReq('GET'), fakeRes()).signal).toBeUndefined();
    const off = new RequestDeadlineMiddleware(undefined, {
      boolean: jest.fn().mockResolvedValue(false),
    } as never);
    through(off, fakeReq('GET', '10'), fakeRes()); // first call reads it
    await sleep(0);
    expect(
      through(off, fakeReq('GET', '10'), fakeRes()).signal,
    ).toBeUndefined();
  });

  it('statement_timeout = the time left, never above the role value', () => {
    const now = 1_000_000;
    const a = runWithDeadline(250, () => deadlineStatementTimeoutMs(now), now);
    expect(a.result).toBe(250);
    a.end();
    const b = runWithDeadline(
      29_000,
      () => deadlineStatementTimeoutMs(now + 28_990),
      now,
    );
    expect(b.result).toBe(10);
    b.end();
    const c = runWithDeadline(
      60_000,
      () => deadlineStatementTimeoutMs(now),
      now,
    );
    expect(c.result).toBe(STATEMENT_TIMEOUT_CEILING_MS);
    c.end();
    expect(deadlineStatementTimeoutMs()).toBeNull();
  });

  it('a read after the deadline stops before it is sent; a write still runs', async () => {
    const ext = requestDeadlineExtension() as unknown as (c: unknown) => {
      query: {
        $allOperations: (p: {
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) => Promise<unknown>;
      };
    };
    // Prisma.defineExtension returns a function of the client; build the
    // extension object the way $extends does.
    const captured: { query?: unknown } = {};
    const fakeClient = {
      $extends: (def: { query: unknown }) => {
        captured.query = def.query;
        return fakeClient;
      },
    };
    ext(fakeClient);
    const hook = (
      captured.query as {
        $allOperations: (p: {
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) => Promise<unknown>;
      }
    ).$allOperations;
    const sent: string[] = [];
    const query = (op: string) => () => {
      sent.push(op);
      return Promise.resolve(op);
    };
    const scope = runWithDeadline(5, async () => {
      await sleep(20);
      await expect(
        hook({ operation: 'findMany', args: {}, query: query('findMany') }),
      ).rejects.toBeInstanceOf(RequestDeadlineError);
      await expect(
        hook({ operation: '$queryRaw', args: {}, query: query('$queryRaw') }),
      ).rejects.toBeInstanceOf(RequestDeadlineError);
      await expect(
        hook({ operation: 'update', args: {}, query: query('update') }),
      ).resolves.toBe('update');
    });
    await scope.result;
    scope.end();
    expect(sent).toEqual(['update']);
    // Outside a deadline scope nothing is stopped.
    await expect(
      hook({ operation: 'findMany', args: {}, query: query('findMany') }),
    ).resolves.toBe('findMany');
  });

  it('throwIfDeadlinePassed is a no-op outside a request with a deadline', () => {
    expect(() => throwIfDeadlinePassed()).not.toThrow();
  });

  it('an outbound fetch of a stopped read is aborted with it', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const real = globalThis.fetch;
    globalThis.fetch = (_i: unknown, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return Promise.resolve(new Response('ok'));
    };
    try {
      installDeadlineFetch({});
      await fetch('http://vendor.test/a'); // no request scope: untouched
      const s = runWithDeadline(10_000, () => fetch('http://vendor.test/b'));
      await s.result;
      s.controller.abort(new RequestDeadlineError('client_closed'));
      expect(seen[0]).toBeUndefined();
      expect(seen[1]?.aborted).toBe(true);
      s.end();
    } finally {
      resetDeadlineFetchForTest();
      globalThis.fetch = real;
    }
  });

  describe('the error answer', () => {
    function run(exception: unknown) {
      const error = jest.fn();
      const warn = jest.fn();
      const logger = {
        setContext: jest.fn(),
        error,
        warn,
      } as unknown as PinoLogger;
      const filter = new AllExceptionsFilter(logger);
      const out = { status: 0, body: null as unknown };
      const response = {
        setHeader: jest.fn(),
        status(code: number) {
          out.status = code;
          return this;
        },
        json(body: unknown) {
          out.body = body;
        },
      };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({ headers: { 'x-request-id': 'r1' } }),
        }),
      } as unknown as ArgumentsHost;
      filter.catch(exception, host);
      return { ...out, error, warn };
    }

    it('a stopped read answers 504 DEADLINE_EXCEEDED, logged as a warning', () => {
      const r = run(new RequestDeadlineError('deadline'));
      expect(r.status).toBe(504);
      expect(r.body).toMatchObject({ error: { code: 'DEADLINE_EXCEEDED' } });
      expect(r.error).not.toHaveBeenCalled();
      expect(r.warn).toHaveBeenCalled();
    });

    it('a database error after the deadline (statement_timeout) is a 504 too', () => {
      let status = 0;
      const s = runWithDeadline(
        1,
        () => {
          status = run(
            new Error('canceling statement due to statement timeout'),
          ).status;
        },
        Date.now() - 10,
      );
      s.end();
      expect(status).toBe(504);
      // The same error with time left stays a 500.
      expect(run(new Error('boom')).status).toBe(500);
    });

    it('an HttpException keeps its own status even after the deadline', () => {
      let status = 0;
      const s = runWithDeadline(
        1,
        () => {
          status = run(new NotFoundException()).status;
        },
        Date.now() - 10,
      );
      s.end();
      expect(status).toBe(404);
    });
  });
});
