import {
  ROLLOUTS_KEY,
  addRollout,
  auditChange,
  breachOf,
  canaryView,
  controlView,
  inCanary,
  newRollout,
  rolloutSettings,
  type ConfigRollout,
} from './config-rollout';

/** Б3 (25.11): the pure rules of a setting change released like code. */
describe('config rollout rules', () => {
  const settings = rolloutSettings({});
  const t0 = new Date('2026-11-25T12:00:00Z');

  function rollout(over: Partial<ConfigRollout> = {}): ConfigRollout {
    const r = newRollout(
      {
        adminId: 'a1',
        action: 'config.app_config',
        before: { 'feed.reco_scan_max': 600 },
        after: { 'feed.reco_scan_max': 900 },
      },
      settings,
      t0,
    );
    if (!r) throw new Error('expected a rollout');
    return { ...r, ...over };
  }

  it('defaults: 10 % of the API tasks, 5 minutes', () => {
    expect(settings.percent).toBe(10);
    expect(settings.watchMinutes).toBe(5);
    const r = rollout();
    expect(r.keys).toEqual(['feed.reco_scan_max']);
    expect(Date.parse(r.watchUntil) - t0.getTime()).toBe(5 * 60_000);
  });

  it('watch 0 = applied at once as before (no rollout)', () => {
    expect(
      newRollout(
        { adminId: 'a', action: 'x', before: { k: 1 }, after: { k: 2 } },
        { ...settings, watchMinutes: 0 },
        t0,
      ),
    ).toBeNull();
  });

  it('money, «Авто», calls and the canary settings themselves are never canaried', () => {
    for (const key of [
      'billing.trial_days',
      'treasury.reserve_percent',
      'infra.auto_on_minutes',
      'scale.max_tasks.api',
      'calls.ring_seconds',
      'realtime.ws_ping_sec',
      'settings.watch_minutes',
      'search.engine',
    ]) {
      expect(
        newRollout(
          {
            adminId: 'a',
            action: 'x',
            before: { [key]: 1 },
            after: { [key]: 2 },
          },
          settings,
          t0,
        ),
      ).toBeNull();
    }
  });

  it('an unchanged value is not a rollout', () => {
    expect(
      newRollout(
        { adminId: 'a', action: 'x', before: { k: 5 }, after: { k: 5 } },
        settings,
        t0,
      ),
    ).toBeNull();
  });

  it('non-canary processes read the OLD value; the canary reads the new one', () => {
    const r = rollout();
    const stored = { 'feed.reco_scan_max': 900, other: 1, [ROLLOUTS_KEY]: [r] };
    expect(controlView(stored, t0.getTime() + 60_000)).toEqual({
      'feed.reco_scan_max': 600,
      other: 1,
    });
    expect(canaryView(stored)).toEqual({ 'feed.reco_scan_max': 900, other: 1 });
  });

  it('a key that had no row goes back to its default for the control', () => {
    const r = rollout({
      before: { 'feed.reco_scan_max': null },
    });
    const view = controlView(
      { 'feed.reco_scan_max': 900, [ROLLOUTS_KEY]: [r] },
      t0.getTime(),
    );
    expect('feed.reco_scan_max' in view).toBe(false);
  });

  it('a missed promotion stops holding old values 10 min after the window', () => {
    const r = rollout();
    const stored = { 'feed.reco_scan_max': 900, [ROLLOUTS_KEY]: [r] };
    const late = Date.parse(r.watchUntil) + 10 * 60_000 + 1;
    expect(controlView(stored, late)).toEqual({ 'feed.reco_scan_max': 900 });
  });

  it('no record = the same object (no copy on the hot path)', () => {
    const plain = { a: 1 };
    expect(controlView(plain, 0)).toBe(plain);
    expect(canaryView(plain)).toBe(plain);
  });

  it('canary tasks: ceil(n · %), at least one, stable', () => {
    const ids = ['c', 'a', 'd', 'b'];
    expect(ids.filter((id) => inCanary(id, ids, 10))).toEqual(['a']);
    expect(ids.filter((id) => inCanary(id, ids, 50)).sort()).toEqual([
      'a',
      'b',
    ]);
    expect(ids.filter((id) => inCanary(id, ids, 100))).toHaveLength(4);
    expect(inCanary('x', ids, 100)).toBe(false); // not registered yet
    expect(inCanary('a', ['a', 'b'], 10)).toBe(true); // 2 tasks, 10 % = one
  });

  it('a second save of a key under watch keeps the FIRST old value', () => {
    const first = rollout();
    const second = newRollout(
      {
        adminId: 'a2',
        action: 'config.app_config',
        before: { 'feed.reco_scan_max': 900 },
        after: { 'feed.reco_scan_max': 1200 },
      },
      settings,
      new Date(t0.getTime() + 60_000),
    ) as ConfigRollout;
    const list = addRollout([first], second);
    expect(list).toHaveLength(1);
    expect(list[0].before).toEqual({ 'feed.reco_scan_max': 600 });
    expect(list[0].after).toEqual({ 'feed.reco_scan_max': 1200 });
    expect(list[0].startedAt).toBe(second.startedAt);
  });

  it('an SLO fast-burn alarm AFTER the start stops the rollout', () => {
    const r = rollout();
    const alarm = {
      component: 'alarm:slo-login-fast',
      opened_at: new Date(t0.getTime() + 60_000),
      closed_at: null,
    };
    expect(breachOf(r, [alarm])).toEqual(alarm);
    expect(
      breachOf(r, [{ ...alarm, component: 'alarm:availability-fast' }]),
    ).not.toBeNull();
  });

  it('an alarm already firing before the change, or a slow burn, does not', () => {
    const r = rollout();
    expect(
      breachOf(r, [
        {
          component: 'alarm:slo-login-fast',
          opened_at: new Date(t0.getTime() - 60_000),
          closed_at: null,
        },
        {
          component: 'alarm:slo-login-slow',
          opened_at: new Date(t0.getTime() + 60_000),
          closed_at: null,
        },
        {
          component: 'alarm:nat-traffic',
          opened_at: new Date(t0.getTime() + 60_000),
          closed_at: null,
        },
      ]),
    ).toBeNull();
  });

  it('reads both audit shapes of a settings save', () => {
    expect(auditChange({ key: 'k', value: 1 }, { key: 'k', value: 2 })).toEqual(
      { before: { k: 1 }, after: { k: 2 } },
    );
    expect(auditChange({ a: 1 }, { a: 2, b: 3 })).toEqual({
      before: { a: 1, b: null },
      after: { a: 2, b: 3 },
    });
    expect(auditChange(null, null)).toBeNull();
  });
});
