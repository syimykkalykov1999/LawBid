import { USAGE_SNAPSHOT_KEY } from '../../../jobs/handlers/usage-poll.job';
import {
  HARD_STOP_SETTING,
  USAGE_SNAPSHOT_REDIS_KEY,
  UsageHardStopService,
  hardStopDecision,
} from './usage-hard-stop.service';

const NOW = new Date('2026-10-20T10:00:00Z');
const crit = {
  at: '2026-10-19T09:00:00Z',
  bunny: { bandwidthLevel: 'crit' },
  cloudflare: { level: 'crit' },
};
const warn = {
  at: '2026-10-19T09:00:00Z',
  bunny: { bandwidthLevel: 'warn' },
  cloudflare: { level: 'warn' },
};

describe('hardStopDecision', () => {
  it('off never stops, on always stops', () => {
    expect(hardStopDecision('bunny', 'off', crit, NOW)).toBe(false);
    expect(hardStopDecision('bunny', 'on', null, NOW)).toBe(true);
    expect(hardStopDecision('cloudflare', 'on', warn, NOW)).toBe(true);
  });

  it('auto stops only at the urgent level of this month', () => {
    expect(hardStopDecision('bunny', 'auto', crit, NOW)).toBe(true);
    expect(hardStopDecision('cloudflare', 'auto', crit, NOW)).toBe(true);
    expect(hardStopDecision('bunny', 'auto', warn, NOW)).toBe(false);
    expect(hardStopDecision('bunny', 'auto', null, NOW)).toBe(false);
    expect(
      hardStopDecision(
        'bunny',
        'auto',
        { ...crit, at: '2026-09-30T09:00:00Z' },
        NOW,
      ),
    ).toBe(false);
    expect(
      hardStopDecision(
        'bunny',
        'auto',
        { at: crit.at, bunny: { storageLevel: 'crit' } },
        NOW,
      ),
    ).toBe(true);
  });
});

describe('UsageHardStopService', () => {
  const make = (mode: string, snap: unknown, redisFails = false) => {
    const settings = { string: jest.fn().mockResolvedValue(mode) };
    const redis = {
      get: jest.fn(() =>
        redisFails
          ? Promise.reject(new Error('down'))
          : Promise.resolve(snap ? JSON.stringify(snap) : null),
      ),
    };
    return {
      svc: new UsageHardStopService(settings as never, redis as never),
      settings,
      redis,
    };
  };

  it('reads the right setting per kind and the shared snapshot key', async () => {
    const { svc, settings, redis } = make('auto', crit);
    expect(await svc.stopped('bunny', NOW.getTime())).toBe(true);
    expect(settings.string).toHaveBeenCalledWith(HARD_STOP_SETTING.bunny);
    expect(redis.get).toHaveBeenCalledWith(USAGE_SNAPSHOT_REDIS_KEY);
    expect(USAGE_SNAPSHOT_REDIS_KEY).toBe(USAGE_SNAPSHOT_KEY);
  });

  it('caches for a minute', async () => {
    const { svc, redis } = make('auto', crit);
    await svc.stopped('cloudflare', NOW.getTime());
    await svc.stopped('cloudflare', NOW.getTime() + 30_000);
    expect(redis.get).toHaveBeenCalledTimes(1);
    await svc.stopped('cloudflare', NOW.getTime() + 61_000);
    expect(redis.get).toHaveBeenCalledTimes(2);
  });

  it('a Redis failure never blocks users', async () => {
    const { svc } = make('auto', crit, true);
    expect(await svc.stopped('bunny', NOW.getTime())).toBe(false);
  });

  it('an unknown mode value is treated as auto', async () => {
    const { svc } = make('banana', crit);
    expect(await svc.stopped('bunny', NOW.getTime())).toBe(true);
  });
});
