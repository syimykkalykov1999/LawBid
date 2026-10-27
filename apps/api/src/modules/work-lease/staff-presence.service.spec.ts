import type Redis from 'ioredis';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffPresenceService } from './staff-presence.service';

const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

/** An in-memory Redis with just the commands presence uses; counts them. */
function fakeRedis() {
  const store = new Map<string, { v: string; ex?: number }>();
  const sent: string[] = [];
  const pipeline = () => {
    const ops: Array<() => unknown> = [];
    const p = {
      set: (k: string, v: string, _ex?: string, ttl?: number) => {
        sent.push(`set ${k}`);
        ops.push(() => store.set(k, { v, ex: ttl }) && 'OK');
        return p;
      },
      get: (k: string) => {
        sent.push(`get ${k}`);
        ops.push(() => store.get(k)?.v ?? null);
        return p;
      },
      exec: () => Promise.resolve(ops.map((f) => [null, f()])),
    };
    return p;
  };
  const redis = {
    pipeline,
    set: (k: string, v: string, _ex?: string, ttl?: number) => {
      store.set(k, { v, ex: ttl });
      return Promise.resolve('OK');
    },
    del: (k: string) => Promise.resolve(Number(store.delete(k))),
    mget: (...keys: string[]) =>
      Promise.resolve(keys.map((k) => store.get(k)?.v ?? null)),
  } as unknown as Redis;
  return { redis, store, sent };
}

describe('StaffPresenceService (staff package T3)', () => {
  it('a heartbeat writes the 45 s presence key (and "seen"), never more than a few Redis commands', async () => {
    const { redis, store, sent } = fakeRedis();
    const svc = new StaffPresenceService(redis, settings());
    const status = await svc.heartbeat('a1', true, 1_000_000);
    expect(status).toBe('online');
    const pres = [...store.entries()].find(([k]) =>
      k.includes('staff:pres:a1'),
    );
    expect(pres?.[1].ex).toBe(45);
    expect(sent.filter((c) => c.startsWith('set')).length).toBe(3);
  });

  it('1000 clients x one heartbeat: only Redis commands, 4 per beat, no other dependency', async () => {
    const { redis, sent } = fakeRedis();
    const svc = new StaffPresenceService(redis, settings());
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        svc.heartbeat(`admin-${i}`, i % 2 === 0, 1_000_000),
      ),
    );
    // pres + seen + away(get) + act (set or get) = 4 per heartbeat.
    expect(sent.length).toBe(4000);
  });

  it('online = signal + movement within 3 min; away = signal without movement or by hand; offline = no signal', async () => {
    const { redis } = fakeRedis();
    const svc = new StaffPresenceService(redis, settings());
    const t = 5_000_000;
    expect(await svc.heartbeat('a', true, t)).toBe('online');
    // 4 minutes later, a heartbeat without movement: away.
    expect(await svc.heartbeat('a', false, t + 240_000)).toBe('away');
    expect(
      svc.statusOf(
        { signalling: false, manualAway: false, activeMs: t },
        t,
        180,
      ),
    ).toBe('offline');
    expect(
      svc.statusOf(
        { signalling: true, manualAway: false, activeMs: t },
        t + 179_000,
        180,
      ),
    ).toBe('online');
    expect(
      svc.statusOf(
        { signalling: true, manualAway: false, activeMs: t },
        t + 181_000,
        180,
      ),
    ).toBe('away');
    await svc.setAway('b', true);
    expect(await svc.heartbeat('b', true, t)).toBe('away');
    await svc.setAway('b', false);
    expect(await svc.heartbeat('b', true, t)).toBe('online');
  });
});
