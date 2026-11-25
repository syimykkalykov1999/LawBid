import { AppSettingsWriter } from './app-settings.writer';
import { ROLLOUTS_KEY, parseRollouts } from './config-rollout';
import { ConfigRolloutService } from './config-rollout.service';

/** A fake Prisma/audit method: runs [f] and answers its result as a promise. */
function resolved<A extends unknown[], R>(f: (...a: A) => R) {
  return jest.fn((...a: A) => Promise.resolve(f(...a)));
}

/** In-memory app_config + system_incidents + audit_log, enough for the
 * writer and the rollout service (one «transaction» = the same store). */
function store(initial: Record<string, unknown> = {}) {
  const rows = new Map<string, unknown>(Object.entries(initial));
  const incidents: {
    component: string;
    opened_at: Date;
    closed_at: Date | null;
  }[] = [];
  const audits: Record<string, unknown>[] = [];
  const auditRows = new Map<string, Record<string, unknown>>();
  const appConfig = {
    findMany: resolved((args?: { where?: { key?: { in?: string[] } } }) => {
      const keys = args?.where?.key?.in;
      return [...rows.entries()]
        .filter(([k]) => !keys || keys.includes(k))
        .map(([key, value]) => ({ key, value }));
    }),
    findUnique: resolved(({ where }: { where: { key: string } }) =>
      rows.has(where.key)
        ? { key: where.key, value: rows.get(where.key) }
        : null,
    ),
    upsert: resolved(
      (a: { where: { key: string }; create: { value: unknown } }) => {
        rows.set(a.where.key, a.create.value);
        return { key: a.where.key, value: a.create.value };
      },
    ),
    deleteMany: resolved(
      ({ where }: { where: { key: string | { in: string[] } } }) => {
        const keys = typeof where.key === 'string' ? [where.key] : where.key.in;
        for (const k of keys) rows.delete(k);
        return { count: keys.length };
      },
    ),
  };
  const tx = {
    appConfig,
    systemIncident: {
      findMany: resolved(({ where }: { where: { opened_at: { gte: Date } } }) =>
        incidents.filter((i) => i.opened_at >= where.opened_at.gte),
      ),
    },
    auditLog: {
      findUnique: resolved(
        ({ where }: { where: { id: string } }) =>
          auditRows.get(where.id) ?? null,
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = {
    record: resolved((e: Record<string, unknown>) => {
      audits.push(e);
    }),
  };
  const redis = { del: jest.fn(), incr: jest.fn() };
  const service = new ConfigRolloutService(
    prisma as never,
    audit as never,
    redis as never,
  );
  const writer = new AppSettingsWriter(
    prisma as never,
    audit as never,
    redis as never,
    service,
  );
  return { rows, incidents, audits, auditRows, service, writer };
}

/**
 * Б3 (25.11): a setting change goes to the canary share first, the SLO
 * fast-burn alarms are watched, an alarm = the old value back for everyone.
 */
describe('ConfigRolloutService', () => {
  const t0 = new Date('2026-11-25T12:00:00Z');
  const optIn = process.env.SETTINGS_ROLLOUT_IN_TESTS;

  beforeAll(() => {
    process.env.SETTINGS_ROLLOUT_IN_TESTS = '1';
  });
  afterAll(() => {
    if (optIn === undefined) delete process.env.SETTINGS_ROLLOUT_IN_TESTS;
    else process.env.SETTINGS_ROLLOUT_IN_TESTS = optIn;
  });

  beforeEach(() => jest.useFakeTimers({ now: t0 }));
  afterEach(() => jest.useRealTimers());

  it('a save is stored AND put under watch with its old value', async () => {
    const s = store({ 'feed.reco_scan_max': 600 });
    await s.writer.write('admin-1', 'feed.settings', {
      'feed.reco_scan_max': 900,
    });
    expect(s.rows.get('feed.reco_scan_max')).toBe(900);
    const [r] = parseRollouts(s.rows.get(ROLLOUTS_KEY));
    expect(r).toMatchObject({
      adminId: 'admin-1',
      keys: ['feed.reco_scan_max'],
      before: { 'feed.reco_scan_max': 600 },
      after: { 'feed.reco_scan_max': 900 },
      percent: 10,
    });
  });

  it('ALARM in the window → the old value is back for everyone, audit settings.auto_revert', async () => {
    const s = store({ 'feed.reco_scan_max': 600 });
    await s.writer.write('admin-1', 'feed.settings', {
      'feed.reco_scan_max': 900,
    });
    s.incidents.push({
      component: 'alarm:slo-feed-fast',
      opened_at: new Date(t0.getTime() + 2 * 60_000),
      closed_at: null,
    });
    const res = await s.service.watch(new Date(t0.getTime() + 3 * 60_000));
    expect(res.reverted).toEqual([
      { id: expect.any(String), alarm: 'alarm:slo-feed-fast' },
    ]);
    expect(s.rows.get('feed.reco_scan_max')).toBe(600);
    expect(s.rows.has(ROLLOUTS_KEY)).toBe(false);
    expect(s.audits.at(-1)).toMatchObject({
      action: 'settings.auto_revert',
      adminId: 'admin-1',
      targetType: 'app_config',
      before: { 'feed.reco_scan_max': 900 },
      after: { 'feed.reco_scan_max': 600 },
    });
  });

  it('ALARM already firing before the change → not reverted, released after the window', async () => {
    const s = store({ 'feed.reco_scan_max': 600 });
    s.incidents.push({
      component: 'alarm:slo-feed-fast',
      opened_at: new Date(t0.getTime() - 60_000),
      closed_at: null,
    });
    await s.writer.write('admin-1', 'feed.settings', {
      'feed.reco_scan_max': 900,
    });
    const mid = await s.service.watch(new Date(t0.getTime() + 2 * 60_000));
    expect(mid).toEqual({ promoted: [], reverted: [] });
    const end = await s.service.watch(new Date(t0.getTime() + 5 * 60_000));
    expect(end.promoted).toHaveLength(1);
    expect(s.rows.get('feed.reco_scan_max')).toBe(900);
    expect(s.rows.has(ROLLOUTS_KEY)).toBe(false);
    expect(s.audits.at(-1)).toMatchObject({
      action: 'settings.rollout_promoted',
    });
  });

  it('a key that had no row is deleted again by the revert (default back)', async () => {
    const s = store();
    await s.writer.write('admin-1', 'feed.settings', {
      'feed.reco_scan_max': 900,
    });
    s.incidents.push({
      component: 'alarm:availability-fast',
      opened_at: new Date(t0.getTime() + 60_000),
      closed_at: null,
    });
    await s.service.watch(new Date(t0.getTime() + 60_000));
    expect(s.rows.has('feed.reco_scan_max')).toBe(false);
  });

  it('money keys apply at once, no watch', async () => {
    const s = store();
    await s.writer.write('admin-1', 'billing.x', {
      'billing.trial_days': 7,
    });
    expect(s.rows.get('billing.trial_days')).toBe(7);
    expect(s.rows.has(ROLLOUTS_KEY)).toBe(false);
  });

  it('API e2e (NODE_ENV=test without the opt-in): every change at once, as before', async () => {
    delete process.env.SETTINGS_ROLLOUT_IN_TESTS;
    try {
      const s = store({ 'feed.reco_scan_max': 600 });
      await s.writer.write('admin-1', 'feed.settings', {
        'feed.reco_scan_max': 900,
      });
      expect(s.rows.has(ROLLOUTS_KEY)).toBe(false);
    } finally {
      process.env.SETTINGS_ROLLOUT_IN_TESTS = '1';
    }
  });

  it('watch 0 in the admin = every change at once, as before', async () => {
    const s = store({ 'settings.watch_minutes': 0 });
    await s.writer.write('admin-1', 'feed.settings', {
      'feed.reco_scan_max': 900,
    });
    expect(s.rows.has(ROLLOUTS_KEY)).toBe(false);
  });

  it('emergency release and «Вернуть» of a change under watch', async () => {
    const s = store({ 'feed.reco_scan_max': 600 });
    await s.writer.write('admin-1', 'feed.settings', {
      'feed.reco_scan_max': 900,
    });
    const [r] = await s.service.pending();
    await s.service.promoteNow('owner', r.id, '1.2.3.4');
    expect(s.rows.has(ROLLOUTS_KEY)).toBe(false);
    expect(s.audits.at(-1)).toMatchObject({
      action: 'settings.rollout_emergency',
      adminId: 'owner',
    });
    await expect(s.service.promoteNow('owner', r.id)).rejects.toMatchObject({
      status: 404,
    });

    await s.writer.write('admin-1', 'feed.settings', {
      'feed.reco_scan_max': 1200,
    });
    const [r2] = await s.service.pending();
    await s.service.cancel('owner', r2.id);
    expect(s.rows.get('feed.reco_scan_max')).toBe(900);
    expect(s.audits.at(-1)).toMatchObject({ action: 'settings.revert' });
  });

  it('«Вернуть» on an audit row: old value back; refused when changed again since', async () => {
    const s = store({ 'feed.reco_scan_max': 900, 'settings.watch_minutes': 0 });
    s.auditRows.set('11111111-1111-1111-1111-111111111111', {
      target_type: 'app_config',
      before: { key: 'feed.reco_scan_max', value: 600 },
      after: { key: 'feed.reco_scan_max', value: 900 },
    });
    await expect(
      s.service.revertChange('owner', '11111111-1111-1111-1111-111111111111'),
    ).resolves.toEqual({ keys: ['feed.reco_scan_max'] });
    expect(s.rows.get('feed.reco_scan_max')).toBe(600);
    expect(s.audits.at(-1)).toMatchObject({
      action: 'settings.revert',
      targetId: '11111111-1111-1111-1111-111111111111',
    });
    // Now the value (600) is not what that row wrote (900): refused.
    await expect(
      s.service.revertChange('owner', '11111111-1111-1111-1111-111111111111'),
    ).rejects.toMatchObject({ status: 409 });
  });
});
