/* eslint-disable @typescript-eslint/require-await -- hand-made fakes */
import { CallsService } from './calls.service';

/** S1-6: request paths sweep at most once per configured interval. */
describe('CallsService.sweepIfDue', () => {
  function make(every: number, lock: (string | null)[]) {
    const svc = Object.create(CallsService.prototype) as Record<
      string,
      unknown
    >;
    svc.settings = { number: jest.fn(async () => every) };
    svc.redis = {
      status: 'ready',
      set: jest.fn(async () => lock.shift() ?? null),
    };
    svc.sweep = jest.fn(async () => 0);
    const run = () =>
      (svc as unknown as { sweepIfDue: () => Promise<void> }).sweepIfDue();
    return { svc, run };
  }

  it('0 (default): every request sweeps, no lock is taken', async () => {
    const { svc, run } = make(0, []);
    await run();
    await run();
    expect(svc.sweep).toHaveBeenCalledTimes(2);
    expect((svc.redis as { set: jest.Mock }).set).not.toHaveBeenCalled();
  });

  it('> 0: only the request that wins the lock sweeps', async () => {
    const { svc, run } = make(5, ['OK', null, null]);
    await run();
    await run();
    await run();
    expect(svc.sweep).toHaveBeenCalledTimes(1);
  });

  it('Redis failure: sweeps (safe side)', async () => {
    const { svc, run } = make(5, []);
    (svc.redis as { set: jest.Mock }).set.mockRejectedValueOnce(new Error('x'));
    await run();
    expect(svc.sweep).toHaveBeenCalledTimes(1);
  });
});
