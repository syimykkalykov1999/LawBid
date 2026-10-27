import type { PinoLogger } from 'nestjs-pino';
import { SloMetricsService } from './slo-metrics.service';

describe('SloMetricsService (owner 2026-10-22, audit #4 §7)', () => {
  const make = () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    return {
      logger,
      slo: new SloMetricsService(logger as unknown as PinoLogger),
    };
  };

  it('writes one line with every counter (zeros included), then starts over', () => {
    const { slo, logger } = make();
    slo.count('pushOk', 3);
    slo.count('pushFailed');
    slo.count('signup');
    expect(slo.flush()).toEqual({
      signup: 1,
      otpSent: 0,
      otpVerified: 0,
      callConnected: 0,
      callFailed: 0,
      pushOk: 3,
      pushFailed: 1,
      turnProviderFailed: 0,
      loginOk: 0,
      loginFail: 0,
      msgSent: 0,
      msgAckLate: 0,
      feedOk: 0,
      feedSlow: 0,
      payOk: 0,
      payFail: 0,
      authFailed: 0,
      otpRequested: 0,
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'slo', pushOk: 3, pushFailed: 1 }),
      'slo counters',
    );
    // Nothing new: no line at all.
    expect(slo.flush()).toBeNull();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('flushes what is left on shutdown', () => {
    const { slo, logger } = make();
    slo.onModuleInit();
    slo.count('otpSent');
    slo.onApplicationShutdown();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
