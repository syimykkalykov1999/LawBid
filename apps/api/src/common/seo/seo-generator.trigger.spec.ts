import { Queue } from 'bullmq';
import {
  SEO_DIRTY_KEY,
  SEO_EVENT_JOB_ID,
  SEO_LAST_RUN_KEY,
  SeoGeneratorTrigger,
  notifySeoPagesChanged,
  parseSeoGeneratorMode,
} from './seo-generator.trigger';

jest.mock('bullmq', () => {
  const queue = {
    getJob: jest.fn(),
    add: jest.fn(),
    close: jest.fn(() => Promise.resolve()),
  };
  return { Queue: jest.fn(() => queue), __queue: queue };
});

jest.mock('../../redis/redis-connection', () => ({
  bullOptions: jest.fn(() => ({ connection: {} })),
}));

const { __queue: q } = jest.requireMock<{
  __queue: Record<string, jest.Mock>;
}>('bullmq');

function make(opts: {
  mode?: string;
  debounce?: number;
  minGap?: number;
  redis?: Record<string, string>;
  noRedisUrl?: boolean;
}) {
  const store: Record<string, string> = { ...(opts.redis ?? {}) };
  const redis = {
    set: jest.fn((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve('OK');
    }),
    get: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
  };
  const settings = {
    string: jest.fn(() => Promise.resolve(opts.mode ?? 'off')),
    number: jest.fn((k: string) =>
      Promise.resolve(
        k === 'seo.generator_debounce_seconds'
          ? (opts.debounce ?? 60)
          : (opts.minGap ?? 10),
      ),
    ),
  };
  const config = {
    get: (k: string) =>
      k === 'REDIS_URL' && !opts.noRedisUrl ? 'redis://x:6379/0' : undefined,
  };
  const logger = { setContext: jest.fn(), debug: jest.fn(), warn: jest.fn() };
  const Ctor = SeoGeneratorTrigger as unknown as new (
    ...a: unknown[]
  ) => SeoGeneratorTrigger;
  return {
    trigger: new Ctor(config, logger, redis, settings),
    redis,
    settings,
    logger,
  };
}

describe('SeoGeneratorTrigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    q.getJob.mockResolvedValue(undefined);
    q.add.mockResolvedValue({});
  });

  it('parses the mode strictly: anything unknown is off', () => {
    expect(parseSeoGeneratorMode('nightly')).toBe('nightly');
    expect(parseSeoGeneratorMode('nightly+events')).toBe('nightly+events');
    expect(parseSeoGeneratorMode('events')).toBe('off');
    expect(parseSeoGeneratorMode(undefined)).toBe('off');
    expect(parseSeoGeneratorMode('Nightly')).toBe('off');
  });

  it('off (the default): nothing queued, Redis and the queue never touched', async () => {
    const { trigger, redis } = make({ mode: 'off' });
    expect(await trigger.notify('attorney-published')).toBe('off');
    expect(redis.set).not.toHaveBeenCalled();
    expect(Queue).not.toHaveBeenCalled();
    expect(q.add).not.toHaveBeenCalled();
  });

  it('nightly only: events are ignored too (the schedule alone runs it)', async () => {
    const { trigger } = make({ mode: 'nightly' });
    expect(await trigger.notify('attorney-removed')).toBe('off');
    expect(q.add).not.toHaveBeenCalled();
  });

  it('nightly+events: one delayed job on the heavy lane with a fixed id, dirty mark set', async () => {
    const { trigger, redis } = make({ mode: 'nightly+events', debounce: 60 });
    expect(await trigger.notify('attorney-published')).toBe('queued');
    expect(redis.set).toHaveBeenCalledWith(
      SEO_DIRTY_KEY,
      expect.any(String),
      'EX',
      172800,
    );
    expect(Queue).toHaveBeenCalledWith('cron-heavy', expect.anything());
    expect(q.add).toHaveBeenCalledWith(
      'seo.generate',
      {},
      expect.objectContaining({
        jobId: SEO_EVENT_JOB_ID,
        delay: 60_000,
        attempts: 1,
        removeOnComplete: true,
      }),
    );
    // BullMQ refuses ':' in a custom id.
    expect(SEO_EVENT_JOB_ID).not.toContain(':');
  });

  it('debounce: a burst of events while the delayed job waits adds nothing', async () => {
    const { trigger } = make({ mode: 'nightly+events' });
    expect(await trigger.notify('attorney-edited')).toBe('queued');
    q.getJob.mockResolvedValue({ id: SEO_EVENT_JOB_ID });
    expect(await trigger.notify('attorney-edited')).toBe('already-queued');
    expect(await trigger.notify('attorney-published')).toBe('already-queued');
    expect(q.add).toHaveBeenCalledTimes(1);
  });

  it('keeps the minimum gap after the last run: the delay stretches', async () => {
    const { trigger } = make({
      mode: 'nightly+events',
      debounce: 60,
      minGap: 10,
      redis: { [SEO_LAST_RUN_KEY]: String(Date.now() - 2 * 60_000) },
    });
    await trigger.notify('attorney-published');
    const delay = (
      q.add.mock.calls[0] as [string, unknown, { delay: number }]
    )[2].delay;
    expect(delay).toBeGreaterThan(7 * 60_000);
    expect(delay).toBeLessThanOrEqual(8 * 60_000);
  });

  it('a queue failure never throws; the nightly run catches up', async () => {
    const { trigger, logger } = make({ mode: 'nightly+events' });
    q.add.mockRejectedValue(new Error('redis down'));
    expect(await trigger.notify('attorney-published')).toBe('failed');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('afterRun: an event that came in during the run gets one follow-up, none otherwise', async () => {
    const started = Date.now() - 5000;
    const dirty = make({
      mode: 'nightly+events',
      redis: { [SEO_DIRTY_KEY]: String(started + 1000) },
    });
    expect(await dirty.trigger.afterRun(started)).toBe('queued');
    const clean = make({
      mode: 'nightly+events',
      redis: { [SEO_DIRTY_KEY]: String(started - 1000) },
    });
    expect(await clean.trigger.afterRun(started)).toBeNull();
    const off = make({ mode: 'off' });
    expect(await off.trigger.afterRun(started)).toBeNull();
  });

  it('notifySeoPagesChanged is a silent no-op without the module, and reaches the instance with it', async () => {
    expect(() => notifySeoPagesChanged('attorney-published')).not.toThrow();
    const { trigger } = make({ mode: 'nightly+events' });
    const spy = jest.spyOn(trigger, 'notify');
    trigger.onModuleInit();
    notifySeoPagesChanged('attorney-removed');
    expect(spy).toHaveBeenCalledWith('attorney-removed');
    await trigger.onModuleDestroy();
    expect(SeoGeneratorTrigger.current).toBeUndefined();
  });
});
