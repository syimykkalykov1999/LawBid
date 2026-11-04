/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call } from '@prisma/client';
import { CallsService } from './calls.service';

/**
 * R-404 (owner 2026-11-04): a call stuck on «Соединение…» ends with reason
 * `failed` about 45 s after the answer. It used to count as a connected call,
 * so nothing on the server ever saw it.
 */
function world(opts: { answeredAgoMs: number; signals: string[] }) {
  const call = {
    id: 'c1',
    status: 'active',
    is_group: false,
    caller_id: 'a',
    callee_id: 'b',
    answered_at: new Date(Date.now() - opts.answeredAgoMs),
  } as unknown as Call;
  const transport = {
    mode: jest.fn(async () => 'auto'),
    recordClientFailure: jest.fn(async () => false),
    verify: jest.fn(async () => false),
  };
  const slo = { count: jest.fn() };
  const logger = { warn: jest.fn(), log: jest.fn() };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    secrets: {
      get: jest.fn(async () => ({
        fields: { keyId: 'test-key', apiToken: 'test-token' },
      })),
    },
    config: { get: () => undefined },
    prisma: { call: { findUnique: jest.fn(async () => ({ ...call })) } },
    realtime: { callSignals: jest.fn(async () => opts.signals) },
    slo,
    logger,
    finish: jest.fn(async () => ({ id: 'c1' })),
  });
  Object.defineProperty(svc, 'cfTransport', { get: () => transport });
  return { svc, transport, slo, logger };
}
const user = { sub: 'a' } as never;
const settle = () => new Promise((r) => setImmediate(r));

describe('a call that never connected (R-404)', () => {
  it('signaling went through: counts as failed, both phones report the relay', async () => {
    const w = world({
      answeredAgoMs: 45_000,
      signals: ['a:offer', 'a:candidate', 'b:answer', 'b:candidate'],
    });
    await w.svc.end(user, 'c1', { reason: 'failed' });
    await settle();
    expect(w.slo.count).toHaveBeenCalledWith('callFailed');
    expect(w.slo.count).not.toHaveBeenCalledWith('callConnected');
    expect(
      w.transport.recordClientFailure.mock.calls.map(
        (c) => (c as unknown[])[1],
      ),
    ).toEqual(['a', 'b']);
    expect(w.transport.verify).toHaveBeenCalledTimes(1);
    expect(w.logger.warn.mock.calls[0][0]).toContain(
      'alert=call_media_never_up',
    );
  });

  it('no answer ever travelled: logged, the relay is NOT blamed', async () => {
    const w = world({ answeredAgoMs: 45_000, signals: ['a:offer'] });
    await w.svc.end(user, 'c1', { reason: 'failed' });
    await settle();
    expect(w.slo.count).toHaveBeenCalledWith('callFailed');
    expect(w.transport.recordClientFailure).not.toHaveBeenCalled();
    expect(w.transport.verify).not.toHaveBeenCalled();
    const line = w.logger.warn.mock.calls[0][0] as string;
    expect(line).toContain('alert=call_no_signaling');
    expect(line).toContain('caller_sent=offer');
    expect(line).toContain('callee_sent=nothing');
  });

  it.each(['cloudflare', 'own'])(
    'calls.transport %s: the breaker is not taught',
    async (mode) => {
      const w = world({ answeredAgoMs: 45_000, signals: ['b:answer'] });
      w.transport.mode.mockResolvedValue(mode);
      await w.svc.end(user, 'c1', { reason: 'failed' });
      await settle();
      expect(w.slo.count).toHaveBeenCalledWith('callFailed');
      expect(w.transport.recordClientFailure).not.toHaveBeenCalled();
      expect(w.transport.verify).not.toHaveBeenCalled();
    },
  );

  it('a call that talked and then lost its link stays a connected call', async () => {
    const w = world({ answeredAgoMs: 120_000, signals: ['b:answer'] });
    await w.svc.end(user, 'c1', { reason: 'failed' });
    await settle();
    expect(w.slo.count).toHaveBeenCalledWith('callConnected');
    expect(w.slo.count).not.toHaveBeenCalledWith('callFailed');
    expect(w.transport.recordClientFailure).not.toHaveBeenCalled();
  });

  it('a person hanging up early is not a failure', async () => {
    const w = world({ answeredAgoMs: 5_000, signals: [] });
    await w.svc.end(user, 'c1', {});
    await settle();
    expect(w.slo.count).toHaveBeenCalledWith('callConnected');
    expect(w.logger.warn).not.toHaveBeenCalled();
  });
});
