import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import {
  RequestIdMiddleware,
  getRequestId,
  resolveRequestId,
} from './request-id.middleware';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fakeReqRes(header?: string | string[]) {
  const headers: Record<string, string | string[] | undefined> = {};
  if (header !== undefined) headers['x-request-id'] = header;
  const req = { headers } as unknown as IncomingMessage;
  const setHeader = jest.fn();
  const res = { headersSent: false, setHeader } as unknown as ServerResponse;
  return { req, res, headers, setHeader };
}

describe('resolveRequestId', () => {
  it('reuses a well-formed incoming X-Request-Id and echoes it', () => {
    const { req, res, headers, setHeader } = fakeReqRes('client-abc_123.4:5');
    expect(resolveRequestId(req, res)).toBe('client-abc_123.4:5');
    expect(headers['x-request-id']).toBe('client-abc_123.4:5');
    expect(setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'client-abc_123.4:5',
    );
  });

  it('generates a UUID when the header is absent and writes it back onto the request', () => {
    const { req, res, headers, setHeader } = fakeReqRes();
    const id = resolveRequestId(req, res);
    expect(id).toMatch(UUID_RE);
    expect(headers['x-request-id']).toBe(id);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
  });

  it.each([
    ['newline log injection', 'abc\n{"level":60}'],
    ['over-long value', 'a'.repeat(129)],
    ['empty value', ''],
    ['spaces', 'has space'],
  ])('replaces an unsafe incoming id (%s) with a fresh UUID', (_, bad) => {
    const { req, res } = fakeReqRes(bad);
    expect(resolveRequestId(req, res)).toMatch(UUID_RE);
  });

  it('is idempotent: a second caller (pino genReqId vs middleware) sees the same id', () => {
    const { req, res } = fakeReqRes();
    const first = resolveRequestId(req, res);
    const second = resolveRequestId(req, res);
    expect(second).toBe(first);
  });

  it('uses the first value of a repeated header', () => {
    const { req, res } = fakeReqRes(['first-id', 'second-id']);
    expect(resolveRequestId(req, res)).toBe('first-id');
  });
});

describe('RequestIdMiddleware', () => {
  it('sets the header, echoes it, and calls next', () => {
    const { req, res, setHeader } = fakeReqRes('mw-id');
    const next = jest.fn() as unknown as NextFunction;
    new RequestIdMiddleware().use(
      req as unknown as Request,
      res as unknown as Response,
      next,
    );
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'mw-id');
    expect(next).toHaveBeenCalledTimes(1);
    expect(getRequestId(req as unknown as Request)).toBe('mw-id');
  });
});
