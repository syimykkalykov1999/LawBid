import { ServiceUnavailableException } from '@nestjs/common';
import {
  HealthController,
  READY_PROBE_CACHE_MS,
  healthDetailAllowed,
} from './health.controller';

/** S11-5 + ASVS 5.0 V13.4.5 (STAGE2_SECURITY #9). */
describe('HealthController', () => {
  const TOKEN = 'test-health-detail-token-0123456789';
  const detail = {
    status: 'ok',
    info: { database: { status: 'up' }, redis: { status: 'up' } },
    error: {},
    details: { database: { status: 'up' }, redis: { status: 'up' } },
  };
  let clock = 0;
  let health: { check: jest.Mock };
  let controller: HealthController;
  const savedVersion = process.env.APP_VERSION;
  const savedToken = process.env.HEALTH_DETAIL_TOKEN;

  beforeEach(() => {
    clock = 1_000_000;
    health = { check: jest.fn(() => Promise.resolve(detail)) };
    controller = new HealthController(
      health as never,
      { isHealthy: jest.fn() } as never,
      { isHealthy: jest.fn() } as never,
    );
    controller.now = () => clock;
    process.env.APP_VERSION = 'abc1234';
    process.env.HEALTH_DETAIL_TOKEN = TOKEN;
  });
  afterEach(() => {
    if (savedVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = savedVersion;
    if (savedToken === undefined) delete process.env.HEALTH_DETAIL_TOKEN;
    else process.env.HEALTH_DETAIL_TOKEN = savedToken;
  });

  it('public ready: only status and version, no dependency names', async () => {
    const r = await controller.ready(undefined);
    expect(r).toEqual({ status: 'ok', version: 'abc1234' });
    expect(JSON.stringify(r)).not.toMatch(/database|redis/);
    expect(await controller.ready('wrong-token')).toEqual({
      status: 'ok',
      version: 'abc1234',
    });
  });

  it('the health token unlocks the per-dependency detail', async () => {
    const r = await controller.ready(TOKEN);
    expect(r).toMatchObject({ version: 'abc1234', details: detail.details });
  });

  it('a flood reuses one probe for 2 s, then probes again', async () => {
    await Promise.all(Array.from({ length: 50 }, () => controller.ready()));
    expect(health.check).toHaveBeenCalledTimes(1);
    clock += READY_PROBE_CACHE_MS - 1;
    await controller.ready();
    expect(health.check).toHaveBeenCalledTimes(1);
    clock += 2;
    await controller.ready();
    expect(health.check).toHaveBeenCalledTimes(2);
  });

  it('a failed check is still a 503, and the public body names nothing', async () => {
    health.check.mockRejectedValue(
      new ServiceUnavailableException({
        status: 'error',
        error: { database: { status: 'down' } },
      }),
    );
    const err = await controller.ready().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    const body = (err as ServiceUnavailableException).getResponse();
    expect(body).toEqual({ status: 'error', version: 'abc1234' });
    clock += READY_PROBE_CACHE_MS;
    const withToken = await controller.ready(TOKEN).catch((e: unknown) => e);
    expect(
      JSON.stringify((withToken as ServiceUnavailableException).getResponse()),
    ).toContain('database');
  });

  it('live returns the version and falls back to dev', () => {
    delete process.env.APP_VERSION;
    expect(controller.live()).toEqual({ status: 'ok', version: 'dev' });
  });

  it('the token needs 24+ characters and an exact match', () => {
    expect(healthDetailAllowed(TOKEN, TOKEN)).toBe(true);
    expect(healthDetailAllowed(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(healthDetailAllowed('short-token', 'short-token')).toBe(false);
    expect(healthDetailAllowed(TOKEN, '')).toBe(false);
    delete process.env.HEALTH_DETAIL_TOKEN;
    expect(healthDetailAllowed(TOKEN)).toBe(false);
  });
});
