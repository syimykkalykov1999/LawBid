import { HealthController } from './health.controller';

/** S11-5: /health/live and /health/ready report the running release. */
describe('HealthController version', () => {
  const health = {
    check: jest.fn((indicators: unknown[]) =>
      Promise.resolve({
        status: 'ok',
        info: {},
        error: {},
        details: { count: indicators.length },
      }),
    ),
  };
  const database = { isHealthy: jest.fn() };
  const redis = { isHealthy: jest.fn() };
  const controller = new HealthController(
    health as never,
    database as never,
    redis as never,
  );
  const saved = process.env.APP_VERSION;
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = saved;
  });

  it('ready returns APP_VERSION next to the terminus result', async () => {
    process.env.APP_VERSION = 'abc1234';
    const r = await controller.ready();
    expect(r.version).toBe('abc1234');
    expect(r.status).toBe('ok');
    expect(r.details).toEqual({ count: 2 });
  });

  it('live returns the version and falls back to dev', async () => {
    delete process.env.APP_VERSION;
    const r = await controller.live();
    expect(r.version).toBe('dev');
  });
});
