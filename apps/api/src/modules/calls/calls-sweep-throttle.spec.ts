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

  it('0 = Авто (default), calm: every request sweeps, no lock is taken', async () => {
    const { svc, run } = make(0, []);
    await run();
    await run();
    expect(svc.sweep).toHaveBeenCalledTimes(2);
    expect((svc.redis as { set: jest.Mock }).set).not.toHaveBeenCalled();
  });

  it('0 = Авто, busy (> 120 requests a minute): only one per 5 s sweeps', async () => {
    const lock: (string | null)[] = ['OK'];
    const { svc, run } = make(0, lock);
    for (let i = 0; i < 119; i += 1) await run(); // calm so far: all sweep
    expect(svc.sweep).toHaveBeenCalledTimes(119);
    (svc.sweep as jest.Mock).mockClear();
    for (let i = 0; i < 10; i += 1) await run(); // over the threshold
    // the first over-threshold request wins the lock, the rest do not
    expect(svc.sweep).toHaveBeenCalledTimes(2);
    expect((svc.redis as { set: jest.Mock }).set).toHaveBeenCalled();
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
