import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { Worker } from 'bullmq';
import type { AppSettingsService } from '../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../common/app-settings/app-settings.defaults';
import type { CronProcessor } from './cron.processor';
import { CRON_LANES, CRON_LANE_CONCURRENCY } from './jobs.constants';
import {
  CRON_LANE_CONCURRENCY_MAX,
  CRON_LANE_CONCURRENCY_SETTING,
  JobsRunner,
} from './jobs.runner';

// Row 181 (DB scale finding 5, owner rule 11): parallel jobs per cron lane
// are owner settings, applied to the running BullMQ workers.

jest.mock('../redis/redis-connection', () => ({
  ...jest.requireActual<typeof import('../redis/redis-connection')>(
    '../redis/redis-connection',
  ),
  bullOptions: (_q: string, url: string) => ({ connection: { url } }),
}));

jest.mock('bullmq', () => {
  const queue = {
    upsertJobScheduler: jest.fn(() => Promise.resolve({})),
    getJobSchedulers: jest.fn(() => Promise.resolve([])),
    removeJobScheduler: jest.fn(() => Promise.resolve(true)),
    close: jest.fn(() => Promise.resolve()),
  };
  return {
    Queue: jest.fn(() => queue),
    // One object per lane; `concurrency` is a plain field like BullMQ's
    // getter/setter pair.
    Worker: jest.fn(
      (_lane: string, _fn: unknown, opts: { concurrency: number }) => ({
        concurrency: opts.concurrency,
        on: jest.fn(),
        close: jest.fn(() => Promise.resolve()),
        isRunning: () => false,
      }),
    ),
  };
});

const info = jest.fn();
const logger = {
  setContext: jest.fn(),
  info,
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

const config = {
  get: () => undefined,
  getOrThrow: () => 'redis://x',
} as unknown as ConfigService;

function settings(values: Record<string, unknown>) {
  return {
    number: jest.fn((key: string) => {
      const v = values[key];
      if (v instanceof Error) return Promise.reject(v);
      return Promise.resolve(
        v === undefined ? APP_SETTINGS[key as keyof typeof APP_SETTINGS] : v,
      );
    }),
  } as unknown as AppSettingsService;
}

function runner(s?: AppSettingsService) {
  return new JobsRunner(
    { mode: 'worker' },
    config,
    {} as CronProcessor,
    logger,
    undefined,
    s,
  );
}

function startedConcurrency(): Record<string, number> {
  const calls = (Worker as unknown as jest.Mock).mock.calls as [
    string,
    unknown,
    { concurrency: number },
  ][];
  return Object.fromEntries(calls.map(([lane, , o]) => [lane, o.concurrency]));
}

describe('JobsRunner lane concurrency (row 181)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('every lane has its own setting, defaults equal to the built-in values', () => {
    for (const lane of CRON_LANES) {
      const key = CRON_LANE_CONCURRENCY_SETTING[lane];
      expect(APP_SETTINGS[key]).toBe(CRON_LANE_CONCURRENCY[lane]);
    }
    expect(new Set(Object.values(CRON_LANE_CONCURRENCY_SETTING)).size).toBe(
      CRON_LANES.length,
    );
  });

  it('starts each lane worker with the owner setting', async () => {
    const r = runner(
      settings({
        'ops.cron_lane_concurrency_heavy': 4,
        'ops.cron_lane_concurrency_heavy_frequent': 2,
      }),
    );
    await r.onApplicationBootstrap();
    expect(startedConcurrency()).toEqual({
      'cron-fast': 3,
      cron: 1,
      'cron-heavy-frequent': 2,
      'cron-heavy': 4,
    });
    await r.onApplicationShutdown();
  });

  it('a bad, out-of-range or unreadable value keeps the built-in default', async () => {
    const r = runner(
      settings({
        'ops.cron_lane_concurrency_fast': 0,
        'ops.cron_lane_concurrency_default': CRON_LANE_CONCURRENCY_MAX + 1,
        'ops.cron_lane_concurrency_heavy_frequent': 1.5,
        'ops.cron_lane_concurrency_heavy': new Error('redis down'),
      }),
    );
    await r.onApplicationBootstrap();
    expect(startedConcurrency()).toEqual(CRON_LANE_CONCURRENCY);
    await r.onApplicationShutdown();
  });

  it('without the settings service the built-in values are used', async () => {
    const r = runner();
    await r.onApplicationBootstrap();
    expect(startedConcurrency()).toEqual(CRON_LANE_CONCURRENCY);
    await r.onApplicationShutdown();
  });

  it('a changed setting reaches the running worker; an unchanged one is left alone', async () => {
    const values: Record<string, unknown> = {};
    const r = runner(settings(values));
    await r.onApplicationBootstrap();
    const workers = (Worker as unknown as jest.Mock).mock.results.map(
      (x) => x.value as { concurrency: number },
    );
    const heavy = workers[CRON_LANES.indexOf('cron-heavy')];
    expect(heavy.concurrency).toBe(1);
    expect(await r.applyLaneConcurrency()).toEqual([]);

    values['ops.cron_lane_concurrency_heavy'] = 3;
    expect(await r.applyLaneConcurrency()).toEqual(['cron-heavy']);
    expect(heavy.concurrency).toBe(3);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'cron-heavy',
        from: 1,
        to: 3,
        metric: 'cron_lane_concurrency',
      }),
      'cron lane concurrency changed',
    );

    // Back to the default when the owner clears it to a bad value.
    values['ops.cron_lane_concurrency_heavy'] = -2;
    expect(await r.applyLaneConcurrency()).toEqual(['cron-heavy']);
    expect(heavy.concurrency).toBe(1);
    await r.onApplicationShutdown();
  });
});
