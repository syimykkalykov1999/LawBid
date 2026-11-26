import {
  ROLLOUTS_KEY,
  addRollout,
  auditChange,
  breachOf,
  expiredHoldIds,
  judgeAlarms,
  ROLLOUTS_KEY as ROLLOUTS_KEY_FOR_HOLDS,
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

  describe('review #1332: who an alarm is blamed on', () => {
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    const fired = (min: number, component = 'alarm:slo-login-fast') => ({
      component,
      opened_at: at(min),
      closed_at: null,
    });

    it('only the NEWEST change before the alarm is reverted; the older one excuses it', () => {
      const older = rollout({ id: 'old', startedAt: at(0).toISOString() });
      const newer = rollout({ id: 'new', startedAt: at(3).toISOString() });
      const v = judgeAlarms([older, newer], [fired(4)], 30 * 60_000);
      expect(v.revert.map((x) => x.rollout.id)).toEqual(['new']);
      expect(v.held).toEqual([]);
      expect(v.excuse.get('old')).toEqual([
        `alarm:slo-login-fast@${at(4).toISOString()}`,
      ]);
      // A change saved after the alarm is not blamed for it at all.
      const later = rollout({ id: 'later', startedAt: at(5).toISOString() });
      expect(
        judgeAlarms([older, later], [fired(4)], 0).revert.map(
          (x) => x.rollout.id,
        ),
      ).toEqual(['old']);
    });

    it('two saves within a minute share the blame', () => {
      const a = rollout({ id: 'a', startedAt: at(0).toISOString() });
      const b = rollout({ id: 'b', startedAt: at(0.5).toISOString() });
      const v = judgeAlarms([a, b], [fired(2)], 0);
      expect(v.revert.map((x) => x.rollout.id).sort()).toEqual(['a', 'b']);
    });

    it('the same alarm open at the start = incident in progress: held, not reverted', () => {
      const r = rollout({ id: 'r', startedAt: at(0).toISOString() });
      const open = {
        component: 'alarm:slo-login-fast',
        opened_at: at(-20),
        closed_at: null,
      };
      // (a flap: a new row for the same alarm during the watch)
      const v = judgeAlarms([r], [open, fired(2)], 30 * 60_000);
      expect(v.revert).toEqual([]);
      expect(v.held.map((x) => x.rollout.id)).toEqual(['r']);
      expect(v.excuse.get('r')).toEqual([
        `alarm:slo-login-fast@${at(2).toISOString()}`,
      ]);
    });

    it('closed less than incident_quiet_minutes before = held; longer ago = revert', () => {
      const r = rollout({ id: 'r', startedAt: at(0).toISOString() });
      const closedRecently = {
        component: 'alarm:slo-login-fast',
        opened_at: at(-40),
        closed_at: at(-10),
      };
      expect(
        judgeAlarms([r], [closedRecently, fired(2)], 30 * 60_000).held,
      ).toHaveLength(1);
      expect(
        judgeAlarms([r], [closedRecently, fired(2)], 5 * 60_000).revert,
      ).toHaveLength(1);
      // Another alarm's incident does not excuse this one.
      expect(
        judgeAlarms(
          [r],
          [{ ...closedRecently, component: 'alarm:slo-feed-fast' }, fired(2)],
          30 * 60_000,
        ).revert,
      ).toHaveLength(1);
    });

    it('an excused firing never counts again', () => {
      const key = `alarm:slo-login-fast@${at(2).toISOString()}`;
      const r = rollout({ id: 'r', excused: [key] });
      expect(judgeAlarms([r], [fired(2)], 0)).toEqual({
        revert: [],
        held: [],
        excuse: new Map(),
      });
    });

    it('incident_quiet_minutes: default 30, read from the admin', () => {
      expect(settings.incidentQuietMinutes).toBe(30);
      expect(
        rolloutSettings({ 'settings.incident_quiet_minutes': 5 })
          .incidentQuietMinutes,
      ).toBe(5);
    });
  });

  it('review #1332: an expired hold is reported once its window + grace is over', () => {
    const r = rollout();
    const config = { [ROLLOUTS_KEY_FOR_HOLDS]: [r] };
    expect(expiredHoldIds(config, t0.getTime() + 60_000)).toEqual([]);
    expect(expiredHoldIds(config, t0.getTime() + 16 * 60_000)).toEqual([r.id]);
    expect(expiredHoldIds({}, t0.getTime())).toEqual([]);
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
