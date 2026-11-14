import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { REGISTRY_HEALTH_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import { RegistryGuardError } from '../providers/bar-lookup/registry-guard';
import type { CheckOutcome } from '../providers/verification-providers';
import {
  classifyError,
  classifyOutcome,
  evaluateHealth,
  field,
  hourOf,
  keepHours,
  staleFields,
} from './registry-health.logic';
import {
  BAR_REGISTRY_DEGRADED_ALERT,
  REGISTRY_DEGRADED_REASON,
  RegistryHealthService,
} from './registry-health.service';

/** Owner row 50 (13.11): health watch of the state bar registries. */

const CFG = { windowHours: 24, baselineDays: 7, minChecks: 5, jumpPoints: 50 };
const KEEP = keepHours(CFG);
const NOW_H = 500_000;

function hash(entries: Array<[number, string, number]>) {
  const h: Record<string, string> = {};
  for (const [age, kind, n] of entries) {
    const f = `${NOW_H - age}:${kind}`;
    h[f] = String(Number(h[f] ?? 0) + n);
  }
  return h;
}

const notFound: CheckOutcome = {
  result: 'fail',
  details: { reason: 'not_found' },
};
const notActive: CheckOutcome = {
  result: 'fail',
  details: { reason: 'not_active' },
};
const pass: CheckOutcome = { result: 'pass', details: {} };

describe('registry health logic', () => {
  it('classifies what the registry itself said', () => {
    expect(classifyOutcome(pass)).toBe('ok');
    expect(classifyOutcome(notActive)).toBe('ok'); // a record was found
    expect(
      classifyOutcome({
        result: 'manual_review',
        details: { reason: 'status_unknown' },
      }),
    ).toBe('ok');
    expect(classifyOutcome(notFound)).toBe('not_found');
    // A cached answer carries no news.
    expect(
      classifyOutcome({
        ...notFound,
        details: { ...notFound.details, cachedAt: 'x' },
      }),
    ).toBeNull();
    expect(classifyError(new Error('HTTP 503'))).toBe('error');
    // Our own throttle / an open breaker are not new registry failures.
    expect(
      classifyError(new RegistryGuardError('rate_limited', 'x')),
    ).toBeNull();
    expect(
      classifyError(new RegistryGuardError('circuit_open', 'x')),
    ).toBeNull();
  });

  it('a site change (all «not found») against a normal week is degraded', () => {
    const h = hash([
      [30, 'ok', 40],
      [50, 'not_found', 4], // 9 % normal typos
      [1, 'not_found', 6],
    ]);
    const v = evaluateHealth(h, NOW_H, CFG);
    expect(v.degraded).toBe(true);
    expect(v.kind).toBe('not_found');
    expect(v.window).toEqual({ ok: 0, not_found: 6, error: 0 });
    expect(v.baseline).toEqual({ ok: 40, not_found: 4, error: 0 });
  });

  it('errors (block, HTTP 5xx) jump on their own', () => {
    const h = hash([
      [30, 'ok', 20],
      [2, 'error', 5],
      [3, 'ok', 1],
    ]);
    expect(evaluateHealth(h, NOW_H, CFG)).toMatchObject({
      degraded: true,
      kind: 'error',
    });
  });

  it('a mix of errors and «not found» counts together', () => {
    const h = hash([
      [30, 'ok', 20],
      [2, 'error', 3],
      [2, 'not_found', 3],
      [2, 'ok', 2],
    ]);
    // error 37 %, not found 37 %, together 75 % against 0 %.
    expect(evaluateHealth(h, NOW_H, CFG)).toMatchObject({
      degraded: true,
      kind: 'bad',
    });
  });

  it('a normal day is healthy; a state with many typos is judged by its own week', () => {
    const normal = hash([
      [30, 'ok', 40],
      [30, 'not_found', 10],
      [1, 'ok', 8],
      [1, 'not_found', 2],
    ]);
    expect(evaluateHealth(normal, NOW_H, CFG).degraded).toBe(false);
    const typos = hash([
      [30, 'ok', 20],
      [30, 'not_found', 20], // 50 % every week
      [1, 'ok', 3],
      [1, 'not_found', 5], // 62 %: only 12 points up
    ]);
    expect(evaluateHealth(typos, NOW_H, CFG).degraded).toBe(false);
  });

  it('too few checks in the window decide nothing', () => {
    const h = hash([[1, 'not_found', 4]]);
    expect(evaluateHealth(h, NOW_H, CFG)).toMatchObject({
      degraded: null,
      kind: null,
    });
  });

  it('a long outage never becomes its own baseline (KNOWN_ERRORS 144)', () => {
    // Broken for 3 days: the older broken hours sit in the baseline range.
    const h = hash([
      [150, 'ok', 50],
      [72, 'not_found', 40],
      [48, 'not_found', 40],
      [1, 'not_found', 6],
    ]);
    // Without the mark the outage looks normal by now…
    expect(evaluateHealth(h, NOW_H, CFG).degraded).toBe(false);
    // …with the mark set 3 days ago those hours are not the baseline.
    expect(evaluateHealth(h, NOW_H, CFG, NOW_H - 80).degraded).toBe(true);
  });

  it("the baseline length is the admin's number, not a constant", () => {
    // Normal 3 days ago, broken 2 days ago and now.
    const h = hash([
      [72, 'ok', 40],
      [48, 'not_found', 60],
      [1, 'not_found', 6],
    ]);
    // 7 days: the broken day is in the baseline, the jump is too small.
    expect(evaluateHealth(h, NOW_H, CFG).degraded).toBe(false);
    // 1 day of baseline (hours 24-47): no data there → baseline 0 → degraded.
    expect(evaluateHealth(h, NOW_H, { ...CFG, baselineDays: 1 }).degraded).toBe(
      true,
    );
    expect(keepHours({ windowHours: 24, baselineDays: 1 })).toBe(72);
  });

  it('old fields are pruned, garbage ignored', () => {
    const h = {
      [field(NOW_H - KEEP, 'ok')]: '3',
      [field(NOW_H - 1, 'ok')]: '3',
      'junk:ok': '1',
      [`${NOW_H - 1}:weird`]: '9',
    };
    expect(staleFields(h, NOW_H, KEEP).sort()).toEqual(
      [field(NOW_H - KEEP, 'ok'), 'junk:ok'].sort(),
    );
    expect(evaluateHealth(h, NOW_H, { ...CFG, minChecks: 1 }).window).toEqual({
      ok: 3,
      not_found: 0,
      error: 0,
    });
  });
});

/** The Redis calls the service makes, in memory. */
function fakeRedis() {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  return {
    kv,
    hashes,
    get: jest.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
    set: jest.fn((k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && kv.has(k)) return Promise.resolve(null);
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(kv.delete(k) ? 1 : 0)),
    expire: jest.fn(() => Promise.resolve(1)),
    hincrby: jest.fn((k: string, f: string, n: number) => {
      const h = hashes.get(k) ?? {};
      h[f] = String(Number(h[f] ?? 0) + n);
      hashes.set(k, h);
      return Promise.resolve(Number(h[f]));
    }),
    hgetall: jest.fn((k: string) =>
      Promise.resolve({ ...(hashes.get(k) ?? {}) }),
    ),
    hdel: jest.fn((k: string, ...fs: string[]) => {
      const h = hashes.get(k) ?? {};
      for (const f of fs) delete h[f];
      return Promise.resolve(fs.length);
    }),
  };
}

function setup(stored: Record<string, unknown> = {}) {
  const redis = fakeRedis();
  const values = { ...REGISTRY_HEALTH_SETTINGS, ...stored } as Record<
    string,
    unknown
  >;
  const settings = {
    boolean: (k: string) => Promise.resolve(values[k] as boolean),
    number: (k: string) => Promise.resolve(values[k] as number),
  } as unknown as AppSettingsService;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const svc = new RegistryHealthService(
    redis as unknown as Redis,
    settings,
    logger as unknown as PinoLogger,
  );
  let t = NOW_H * 3_600_000 + 10 * 60_000;
  svc.now = () => t;
  const tick = (ms: number) => {
    t += ms;
  };
  /** Seeds a normal week for CA: 40 found, 4 not found, 8 days ago. */
  const normalWeek = () => {
    redis.hashes.set(RegistryHealthService.countsKey('CA'), {
      [field(hourOf(t) - 48, 'ok')]: '40',
      [field(hourOf(t) - 48, 'not_found')]: '4',
    });
  };
  return { svc, redis, logger, tick, normalWeek, values };
}

const alerts = (logger: {
  error: jest.Mock<void, [Record<string, unknown>, string]>;
}): Array<[Record<string, unknown>, string]> =>
  logger.error.mock.calls.filter(
    (c) => c[0].alert === BAR_REGISTRY_DEGRADED_ALERT,
  );

describe('RegistryHealthService', () => {
  it('owner 13.11: each number is read live from the admin and changes the decision', async () => {
    const s = setup();
    const values = s.values;
    s.normalWeek();
    // 3 not-found: below the default minimum of 5 → nothing.
    for (let i = 0; i < 3; i++) {
      await s.svc.observe('CA', Promise.resolve(notFound));
      s.tick(61_000);
    }
    expect(await s.svc.registryDegraded('CA')).toBe(false);
    // The owner lowers the minimum to 3: the next lookup marks it.
    values['verification.registry_health.min_checks'] = 3;
    await s.svc.observe('CA', Promise.resolve(notFound));
    s.tick(61_000);
    expect(await s.svc.registryDegraded('CA')).toBe(true);
    // The owner raises the jump to 100 points: 100 % vs 9 % is only 91 →
    // healthy again at the next lookup (no restart).
    values['verification.registry_health.jump_points'] = 100;
    await s.svc.observe('CA', Promise.resolve(notFound));
    s.tick(61_000);
    expect(await s.svc.registryDegraded('CA')).toBe(false);
    // Jump back to 50, but a 1-day baseline: the normal week (48 h ago)
    // is out of it and the window's own rate counts from 0 → degraded.
    values['verification.registry_health.jump_points'] = 50;
    values['verification.registry_health.baseline_days'] = 1;
    values['verification.registry_health.window_hours'] = 12;
    await s.svc.observe('CA', Promise.resolve(notFound));
    s.tick(61_000);
    expect(await s.svc.registryDegraded('CA')).toBe(true);
    // The kept history follows the admin too (12 h + 1 day + 1 day).
    expect(s.redis.expire).toHaveBeenLastCalledWith(
      RegistryHealthService.countsKey('CA'),
      keepHours({ windowHours: 12, baselineDays: 1 }) * 3600,
    );
  });

  it('marks a state degraded once, alerts once, and sends its «fail» to a person', async () => {
    const s = setup();
    s.normalWeek();
    const results: CheckOutcome[] = [];
    for (let i = 0; i < 7; i++) {
      results.push(await s.svc.observe('CA', Promise.resolve(notFound)));
      s.tick(61_000); // past the once-a-minute evaluation gate
    }
    expect(await s.svc.registryDegraded('CA')).toBe(true);
    expect(await s.svc.registryDegraded('NY')).toBe(false);
    expect(alerts(s.logger)).toHaveLength(1);
    expect(alerts(s.logger)[0][0]).toMatchObject({
      state: 'CA',
      kind: 'not_found',
    });
    // The 5th not-found tipped it; later ones come back for a person.
    expect(results[0]).toEqual(notFound);
    expect(results[6]).toEqual({
      result: 'manual_review',
      details: {
        reason: REGISTRY_DEGRADED_REASON,
        registryReason: 'not_found',
        registryDegraded: true,
      },
    });
    // «Not active» from a broken site is not trusted either.
    const na = await s.svc.observe('CA', Promise.resolve(notActive));
    expect(na).toMatchObject({
      result: 'manual_review',
      details: {
        reason: REGISTRY_DEGRADED_REASON,
        registryReason: 'not_active',
      },
    });
    // A clean pass stays a pass, only marked.
    const p = await s.svc.observe('CA', Promise.resolve(pass));
    expect(p).toEqual({ result: 'pass', details: { registryDegraded: true } });
  });

  it('counts the raw answer, so the mark clears itself when the site is back', async () => {
    const s = setup();
    s.normalWeek();
    for (let i = 0; i < 6; i++) {
      await s.svc.observe('CA', Promise.resolve(notFound));
      s.tick(61_000);
    }
    expect(await s.svc.registryDegraded('CA')).toBe(true);
    // The site is fixed; a day later the window holds only good answers.
    s.tick(25 * 3_600_000);
    for (let i = 0; i < 5; i++) {
      await s.svc.observe('CA', Promise.resolve(pass));
      s.tick(61_000);
    }
    expect(await s.svc.registryDegraded('CA')).toBe(false);
    expect(
      s.logger.info.mock.calls.some(
        (c) => (c[0] as { event?: string }).event === 'bar_registry_recovered',
      ),
    ).toBe(true);
  });

  it('errors are counted and rethrown unchanged; our own throttle is not counted', async () => {
    const s = setup();
    const boom = new Error('HTTP 503');
    await expect(s.svc.observe('CA', Promise.reject(boom))).rejects.toBe(boom);
    const throttle = new RegistryGuardError('rate_limited', 'x');
    await expect(s.svc.observe('CA', Promise.reject(throttle))).rejects.toBe(
      throttle,
    );
    const h = s.redis.hashes.get(RegistryHealthService.countsKey('CA'))!;
    expect(Object.entries(h)).toEqual([[`${NOW_H}:error`, '1']]);
  });

  it('a broken Redis never breaks or changes a lookup', async () => {
    const s = setup();
    const fail = () => Promise.reject(new Error('redis down'));
    s.redis.hincrby.mockImplementation(fail);
    s.redis.get.mockImplementation(fail);
    await expect(
      s.svc.observe('CA', Promise.resolve(notFound)),
    ).resolves.toEqual(notFound);
    expect(await s.svc.registryDegraded('CA')).toBe(false);
  });

  it('switched off: nothing counted, nothing marked', async () => {
    const s = setup({ 'verification.registry_health.enabled': false });
    s.redis.kv.set(RegistryHealthService.markKey('CA'), '{"since":"x"}');
    await expect(
      s.svc.observe('CA', Promise.resolve(notFound)),
    ).resolves.toEqual(notFound);
    expect(s.redis.hincrby).not.toHaveBeenCalled();
    expect(await s.svc.registryDegraded('CA')).toBe(false);
  });
});
