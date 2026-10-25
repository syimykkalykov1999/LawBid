import {
  ServiceUnavailableException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { AuditLogService } from '../admin-access/audit-log.service';
import {
  JUSTIFICATION_KEY,
  PRIVATE_READ_KEY,
  STRICT_AUDIT_KEY,
} from './admin-auth.decorators';
import { AdminAuditInterceptor } from './admin-audit.interceptor';

function run(opts: {
  method?: string;
  url?: string;
  strict?: boolean;
  privateKind?: string;
  auditFails?: boolean;
  handler?: () => unknown;
}) {
  const meta: Record<string, unknown> = {
    [STRICT_AUDIT_KEY]: opts.strict,
    [PRIVATE_READ_KEY]: opts.privateKind,
    [JUSTIFICATION_KEY]: opts.privateKind ? true : undefined,
  };
  const reflector = {
    getAllAndOverride: (k: string) => meta[k],
    get: () => undefined,
  } as unknown as Reflector;
  const record = opts.auditFails
    ? jest.fn().mockRejectedValue(new Error('db down'))
    : jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditLogService;
  const req = {
    method: opts.method ?? 'POST',
    originalUrl: opts.url ?? '/api/v1/admin/users/5f0c8d8e-4c4e-4f0b-9a5e-6f6b1d2f3a4b/warn',
    url: '/x',
    path: '/api/v1/admin/users/x/warn',
    route: { path: '/api/v1/admin/users/:id/warn' },
    params: { id: '5f0c8d8e-4c4e-4f0b-9a5e-6f6b1d2f3a4b' },
    body: { reason: 'spam' },
    ip: '203.0.113.9',
    admin: {
      id: 'a1',
      justification: 'Report 42: harassment',
      reasonCode: 'report_review',
    },
  };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const handle = jest.fn(() =>
    opts.handler ? (opts.handler() as never) : of({ ok: true }),
  );
  const interceptor = new AdminAuditInterceptor(reflector, audit);
  return {
    out: () =>
      lastValueFrom(interceptor.intercept(ctx, { handle } as CallHandler)),
    record,
    handle,
  };
}

describe('AdminAuditInterceptor: fail closed on sensitive routes (owner 2026-10-28)', () => {
  it('writes the row BEFORE the handler on a strict route', async () => {
    const order: string[] = [];
    const t = run({ strict: true });
    t.record.mockImplementation(async () => {
      order.push('audit');
    });
    t.handle.mockImplementation((() => {
      order.push('handler');
      return of({ ok: true });
    }) as never);
    await t.out();
    expect(order).toEqual(['audit', 'handler']);
    expect(t.record).toHaveBeenCalledTimes(1);
  });

  it('does NOT run the handler when the audit write fails on a strict route', async () => {
    const t = run({ strict: true, auditFails: true });
    await expect(t.out()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(t.handle).not.toHaveBeenCalled();
  });

  it('a private read is strict by itself and stores the reason code', async () => {
    const t = run({ method: 'GET', privateKind: 'chat_messages' });
    await t.out();
    expect(t.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.private_read.chat_messages',
        reasonCode: 'report_review',
        justification: 'Report 42: harassment',
      }),
    );
    const failing = run({
      method: 'GET',
      privateKind: 'chat_messages',
      auditFails: true,
    });
    await expect(failing.out()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(failing.handle).not.toHaveBeenCalled();
  });

  it('money and key areas are strict without any decorator', async () => {
    const t = run({
      url: '/api/v1/admin/billing/refunds',
      auditFails: true,
    });
    await expect(t.out()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(t.handle).not.toHaveBeenCalled();
  });

  it('keeps today’s behaviour elsewhere: a failed audit write does not undo the action', async () => {
    const t = run({ auditFails: true });
    await expect(t.out()).resolves.toEqual({ ok: true });
    expect(t.handle).toHaveBeenCalled();
  });

  it('a failed handler still leaves a `failed` row (strict and not)', async () => {
    for (const strict of [true, false]) {
      const t = run({
        strict,
        handler: () => throwError(() => new Error('boom')),
      });
      await expect(t.out()).rejects.toThrow('boom');
      expect(t.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ after: { outcome: 'failed', status: 500 } }),
      );
    }
  });
});
