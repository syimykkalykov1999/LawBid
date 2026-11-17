import { ForbiddenException } from '@nestjs/common';
import {
  assertHotlineOn,
  decideHotlineAccess,
  HOTLINE_FLAG,
  type HotlineAccessInput,
} from './hotline-access';
import { FLAG_CATALOG } from '../feature-flags/flag-catalog';
import {
  BASELINE_DEFAULTS,
  ENTITLEMENT_CATALOG,
} from '../plans/entitlement-catalog';

const DAY = 24 * 60 * 60 * 1000;
const base: HotlineAccessInput = {
  mode: 'free',
  entitled: false,
  addonActive: false,
  trialDays: 0,
  trialMinutes: 0,
  firstOnlineAt: null,
  minutesUsed: 0,
  now: 100 * DAY,
};

describe('hotline switch (owner row 87)', () => {
  it('off by default: 403 FEATURE_DISABLED with details.flag', async () => {
    expect(FLAG_CATALOG.find((f) => f.key === HOTLINE_FLAG)?.enabled).toBe(
      false,
    );
    const err = await assertHotlineOn({
      isEnabled: () => Promise.resolve(false),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'FEATURE_DISABLED',
      details: { flag: 'hotline' },
    });
  });

  it('on: passes', async () => {
    await expect(
      assertHotlineOn({ isEnabled: () => Promise.resolve(true) }),
    ).resolves.toBeUndefined();
  });

  it('the plan builder lists «Горячая линия» for attorneys only, off in the baseline', () => {
    const def = ENTITLEMENT_CATALOG.find((d) => d.key === 'hotline');
    expect(def?.audiences).toEqual(['attorney']);
    expect(def?.label.ru).toBe('Горячая линия');
    expect(BASELINE_DEFAULTS.attorney.hotline).toBe(false);
    expect(BASELINE_DEFAULTS.client.hotline).toBeUndefined();
  });
});

describe('decideHotlineAccess (owner 16.11 ~18:35)', () => {
  it('«Бесплатно» (default): every attorney, whatever the plan', () => {
    expect(decideHotlineAccess(base)).toEqual({ allowed: true, via: 'free' });
  });

  it('«Входит в подписку»: only a ticked plan', () => {
    expect(decideHotlineAccess({ ...base, mode: 'plan' })).toEqual({
      allowed: false,
      reason: 'not_in_plan',
    });
    expect(
      decideHotlineAccess({ ...base, mode: 'plan', entitled: true }),
    ).toEqual({ allowed: true, via: 'plan' });
  });

  it('«Отдельное дополнение»: the add-on (or an admin grant)', () => {
    expect(decideHotlineAccess({ ...base, mode: 'addon' })).toEqual({
      allowed: false,
      reason: 'addon_required',
    });
    expect(
      decideHotlineAccess({ ...base, mode: 'addon', addonActive: true }),
    ).toEqual({ allowed: true, via: 'addon' });
    expect(
      decideHotlineAccess({ ...base, mode: 'addon', entitled: true }),
    ).toEqual({ allowed: true, via: 'addon' });
  });

  it('trial in days: from the first «Ожидать звонки», then over', () => {
    const t = { ...base, mode: 'addon' as const, trialDays: 7 };
    expect(decideHotlineAccess(t).allowed).toBe(true); // never used yet
    expect(
      decideHotlineAccess({ ...t, firstOnlineAt: t.now - 6 * DAY }),
    ).toEqual({ allowed: true, via: 'trial' });
    expect(
      decideHotlineAccess({ ...t, firstOnlineAt: t.now - 7 * DAY }).allowed,
    ).toBe(false);
  });

  it('trial in minutes: talked minutes; both set = both must be left', () => {
    const t = { ...base, mode: 'plan' as const, trialMinutes: 60 };
    expect(decideHotlineAccess({ ...t, minutesUsed: 59 }).allowed).toBe(true);
    expect(decideHotlineAccess({ ...t, minutesUsed: 60 }).allowed).toBe(false);
    const both = { ...t, trialDays: 30, firstOnlineAt: t.now - DAY };
    expect(decideHotlineAccess({ ...both, minutesUsed: 10 }).allowed).toBe(
      true,
    );
    expect(decideHotlineAccess({ ...both, minutesUsed: 60 }).allowed).toBe(
      false,
    );
  });

  it('no trial set = no trial', () => {
    expect(decideHotlineAccess({ ...base, mode: 'plan' }).allowed).toBe(false);
  });
});
