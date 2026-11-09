import { CRON_SLOW_MS, CronProcessor } from './cron.processor';

/** G8 (2026-11-08): which job holds the one-at-a-time `cron` lane. */
describe('CronProcessor slow-run log', () => {
  function processor(runMs: number, fail = false) {
    const p = Object.create(CronProcessor.prototype) as CronProcessor;
    const warn = jest.fn();
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    Object.assign(p, {
      logger: { warn },
      locked: () => {
        now += runMs;
        return fail
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ ok: true });
      },
    });
    return { p, warn };
  }

  afterEach(() => jest.restoreAllMocks());

  it('a long run is logged with its name and lane', async () => {
    const { p, warn } = processor(CRON_SLOW_MS + 5);
    await expect(p.process('feed-reco')).resolves.toEqual({ ok: true });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'cron_slow',
        job: 'feed-reco',
        ms: CRON_SLOW_MS + 5,
      }),
      'cron job slow',
    );
  });

  it('a quick run says nothing', async () => {
    const { p, warn } = processor(100);
    await p.process('feed-reco');
    expect(warn).not.toHaveBeenCalled();
  });

  it('a slow run that fails is logged and still fails', async () => {
    const { p, warn } = processor(CRON_SLOW_MS, true);
    await expect(p.process('feed-reco')).rejects.toThrow('boom');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
