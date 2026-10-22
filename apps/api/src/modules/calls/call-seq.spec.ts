import { CallsService } from './calls.service';

/** Owner 2026-10-22 (client economy plan, package H): every `call:*`
 * event carries a growing per-call `seq`; the app resyncs on a gap. */
describe('call event seq', () => {
  function service(redis: unknown) {
    const svc = Object.create(CallsService.prototype) as CallsService;
    Object.assign(svc, { redis });
    return svc as unknown as {
      withSeq: (
        callId: string,
        payload: object,
      ) => Promise<{ seq: number } & Record<string, unknown>>;
    };
  }

  it('counts 1, 2, 3 per call and keeps the key a day', async () => {
    const store = new Map<string, number>();
    const expire = jest.fn().mockResolvedValue(1);
    const redis = {
      status: 'ready',
      incr: jest.fn((k: string) => {
        const v = (store.get(k) ?? 0) + 1;
        store.set(k, v);
        return Promise.resolve(v);
      }),
      expire,
    };
    const svc = service(redis);
    expect(await svc.withSeq('c1', { callId: 'c1' })).toEqual({
      callId: 'c1',
      seq: 1,
    });
    expect((await svc.withSeq('c1', {})).seq).toBe(2);
    expect((await svc.withSeq('c2', {})).seq).toBe(1);
    expect(expire).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenCalledWith('call:seq:c1', 86_400);
  });

  it('without Redis (or when it is down) the field is 0', async () => {
    expect((await service(undefined).withSeq('c1', { a: 1 })).seq).toBe(0);
    const down = {
      status: 'ready',
      incr: jest.fn().mockRejectedValue(new Error('down')),
      expire: jest.fn(),
    };
    expect((await service(down).withSeq('c1', {})).seq).toBe(0);
    const notReady = { status: 'connecting', incr: jest.fn() };
    expect((await service(notReady).withSeq('c1', {})).seq).toBe(0);
    expect(notReady.incr).not.toHaveBeenCalled();
  });
});
