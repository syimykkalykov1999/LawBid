import type Redis from 'ioredis';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { FILE_03_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import { BarAttemptsService } from './bar-attempts.service';

/** Just the Redis calls the service makes, in memory (TTL in seconds). */
function fakeRedis() {
  const values = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    incr: (k: string) => {
      const v = (values.get(k) ?? 0) + 1;
      values.set(k, v);
      return Promise.resolve(v);
    },
    expire: () => Promise.resolve(1),
    set: (k: string, _v: string, _ex: string, seconds: number) => {
      values.set(k, 1);
      ttls.set(k, seconds);
      return Promise.resolve('OK');
    },
    ttl: (k: string) => Promise.resolve(ttls.get(k) ?? -2),
    del: (...ks: string[]) => {
      for (const k of ks) {
        values.delete(k);
        ttls.delete(k);
      }
      return Promise.resolve(ks.length);
    },
    endLock: (k: string) => ttls.delete(k),
  };
}

const settings = {
  number: (k: keyof typeof FILE_03_SETTINGS) =>
    Promise.resolve(FILE_03_SETTINGS[k] as number),
  string: (k: keyof typeof FILE_03_SETTINGS) =>
    Promise.resolve(FILE_03_SETTINGS[k] as string),
} as unknown as AppSettingsService;

describe('BarAttemptsService (owner 2026-10-18: 5 tries → 1 hour)', () => {
  it('defaults: 5 wrong numbers, first lock 1 hour', () => {
    expect(FILE_03_SETTINGS['verification.bar_fails_per_step']).toBe(5);
    expect(
      FILE_03_SETTINGS['verification.bar_cooldown_hours'].split(',')[0],
    ).toBe('1');
  });

  it('four failures do not lock; the fifth locks for exactly 3600 s', async () => {
    const redis = fakeRedis();
    const s = new BarAttemptsService(redis as unknown as Redis, settings);
    for (let i = 0; i < 4; i += 1) {
      expect(await s.recordFailure('u1')).toBe(0);
    }
    expect(await s.remainingSeconds('u1')).toBe(0);
    expect(await s.recordFailure('u1')).toBe(3600);
    expect(await s.remainingSeconds('u1')).toBe(3600);
  });

  it('later series step up (12 h) and a correct number starts over', async () => {
    const redis = fakeRedis();
    const s = new BarAttemptsService(redis as unknown as Redis, settings);
    for (let i = 0; i < 5; i += 1) await s.recordFailure('u2');
    redis.endLock('bar:cool:u:u2');
    for (let i = 0; i < 4; i += 1) await s.recordFailure('u2');
    expect(await s.recordFailure('u2')).toBe(12 * 3600);
    await s.reset('u2');
    expect(await s.remainingSeconds('u2')).toBe(0);
    for (let i = 0; i < 4; i += 1) {
      expect(await s.recordFailure('u2')).toBe(0);
    }
  });
});
