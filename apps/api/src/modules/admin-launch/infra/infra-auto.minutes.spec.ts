import { autoWaits, dueWants, type AutoWant } from './infra-auto.logic';

/**
 * Owner 14.11 (live tests within minutes; «No limits on owner»): every
 * «Авто» wait is settable in minutes. A minute override > 0 wins over the
 * hour setting; 0 = the hour setting (today's behaviour). No 6 h / 10 min
 * floors any more: the technical floor is 1 minute (one look = one cycle).
 */
describe('«Авто» waits in minutes', () => {
  const s = (v: Record<string, number>) => (k: string) => v[k] ?? 0;
  const DEFAULTS = {
    'infra.auto_on_minutes': 30,
    'infra.auto_off_hours': 72,
    'infra.auto_off_minutes': 0,
    'infra.waf_attack_on_minutes': 5,
    'infra.waf_calm_off_hours': 3,
    'infra.waf_calm_off_minutes': 0,
  };

  it('defaults stay as today: on 30 min, off 72 h, WAF on 5 min, WAF off 3 h', () => {
    expect(autoWaits(s(DEFAULTS))).toEqual({
      onMs: 30 * 60_000,
      offMs: 72 * 3_600_000,
      wafOnMs: 5 * 60_000,
      wafOffMs: 3 * 3_600_000,
    });
  });

  it('a minute override wins; no 6 h / 10 min floors', () => {
    const w = autoWaits(
      s({
        ...DEFAULTS,
        'infra.auto_on_minutes': 1,
        'infra.auto_off_minutes': 10,
        'infra.waf_calm_off_minutes': 10,
      }),
    );
    expect(w).toMatchObject({
      onMs: 60_000,
      offMs: 600_000,
      wafOffMs: 600_000,
    });
    expect(autoWaits(s({ ...DEFAULTS, 'infra.auto_off_hours': 1 })).offMs).toBe(
      3_600_000,
    );
  });

  it('a 10-minute off wait really switches the item off after 10 minutes', () => {
    const { onMs, offMs } = autoWaits(
      s({ ...DEFAULTS, 'infra.auto_off_minutes': 10 }),
    );
    const off: AutoWant = {
      id: 'aws.rds_replicas',
      to: 'off',
      reason: 'quiet',
    };
    const t0 = Date.UTC(2026, 10, 15, 3, 0);
    const first = dueWants([off], {}, t0, onMs, offMs);
    expect(first.due).toEqual([]);
    expect(
      dueWants([off], first.seen, t0 + 9 * 60_000, onMs, offMs).due,
    ).toEqual([]);
    expect(
      dueWants([off], first.seen, t0 + 10 * 60_000, onMs, offMs).due,
    ).toEqual([off]);
  });

  it('0 or junk never means «at once»: at least one minute', () => {
    const w = autoWaits(
      s({ 'infra.auto_on_minutes': 0, 'infra.auto_off_hours': 0 }),
    );
    expect(w.onMs).toBe(60_000);
    expect(w.offMs).toBe(60_000);
  });
});
