import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { AppEventsService } from './app-events.service';
import {
  ClientSliMetricsService,
  countersOf,
  isClientSliEvent,
} from './client-sli-metrics.service';

// AppEventsService imports PrismaService only as a type here; its real
// module pulls in the generated client, which this unit test does not need.
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../feature-flags/services/feature-flags.service', () => ({
  FeatureFlagsService: class {},
}));

/** Б6 (25.11): service level as the person sees it (SRE Workbook ch. 2). */
describe('ClientSliMetricsService', () => {
  const make = () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    return {
      logger,
      sli: new ClientSliMetricsService(logger as unknown as PinoLogger),
    };
  };

  it('maps the six flows and the web vitals to their counters', () => {
    expect(countersOf('sli_login_ok')).toEqual(['loginOk']);
    expect(countersOf('sli_feed_slow')).toEqual(['feedBad']);
    expect(countersOf('sli_message_fail')).toEqual(['msgBad']);
    expect(countersOf('sli_pay_ok')).toEqual(['payOk']);
    expect(countersOf('sli_call_fail')).toEqual(['callBad']);
    expect(countersOf('sli_push_ok')).toEqual(['pushOk']);
    expect(countersOf('web_vital_lcp_good')).toEqual(['lcpGood', 'lcpAll']);
    expect(countersOf('web_vital_inp_ni')).toEqual(['inpAll']);
    expect(countersOf('web_vital_cls_poor')).toEqual(['clsAll']);
    expect(countersOf('screen_view')).toEqual([]);
    expect(isClientSliEvent('sli_login_maybe')).toBe(false);
  });

  it('writes one {metric:"slo_client"} line a minute, then starts over', () => {
    const { sli, logger } = make();
    sli.record('sli_feed_ok');
    sli.record('sli_feed_slow');
    sli.record('web_vital_lcp_good');
    sli.record('web_vital_lcp_poor');
    expect(sli.record('app_open')).toBe(false);
    const line = sli.flush();
    expect(line).toMatchObject({
      feedOk: 1,
      feedBad: 1,
      lcpGood: 1,
      lcpAll: 2,
      loginOk: 0,
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'slo_client', feedOk: 1, lcpAll: 2 }),
      'client sli counters',
    );
    expect(sli.flush()).toBeNull();
  });

  it('AppEventsService: SLI events are counted, not written to the table', async () => {
    const { sli } = make();
    const executeRaw = jest.fn().mockResolvedValue(1);
    const svc = new AppEventsService(
      { $executeRaw: executeRaw } as unknown as PrismaService,
      {
        isEnabled: jest.fn().mockResolvedValue(true),
      } as unknown as FeatureFlagsService,
      sli,
    );
    await svc.ingest([
      { name: 'sli_message_ok' },
      { name: 'web_vital_cls_good' },
      { name: 'screen_view', screen: '/feed' },
    ]);
    expect(executeRaw).toHaveBeenCalledTimes(1); // only screen_view
    expect(sli.flush()).toMatchObject({ msgOk: 1, clsGood: 1, clsAll: 1 });
  });

  it('AppEventsService: flag app_events off drops SLI events too', async () => {
    const { sli } = make();
    const svc = new AppEventsService(
      { $executeRaw: jest.fn() } as unknown as PrismaService,
      {
        isEnabled: jest.fn().mockResolvedValue(false),
      } as unknown as FeatureFlagsService,
      sli,
    );
    await svc.ingest([{ name: 'sli_login_fail' }]);
    expect(sli.flush()).toBeNull();
  });
});
