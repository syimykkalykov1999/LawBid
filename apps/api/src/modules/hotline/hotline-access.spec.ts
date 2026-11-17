import { ForbiddenException } from '@nestjs/common';
import {
  assertHotlineOn,
  decideHotlineAccess,
  HOTLINE_FLAG,
  type HotlineAccessInput,
} from './hotline-access';
import {
  ackField,
  disclosureFor,
  HOTLINE_DISCLOSURE_TEXTS,
} from './hotline-disclosures';
import { FLAG_CATALOG } from '../feature-flags/flag-catalog';
import {
  BASELINE_DEFAULTS,
  ENTITLEMENT_CATALOG,
  sanitizeEntitlements,
} from '../plans/entitlement-catalog';

const DAY = 24 * 60 * 60 * 1000;
const base: HotlineAccessInput = {
  freeForAll: false,
  included: false,
  addonPriceCents: null,
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

  it('every plan has «Входит в тариф» and «Отдельное дополнение $N» for attorneys; baseline = «Недоступно»', () => {
    const inc = ENTITLEMENT_CATALOG.find((d) => d.key === 'hotline');
    const addon = ENTITLEMENT_CATALOG.find(
      (d) => d.key === 'hotline_addon_price_cents',
    );
    expect(inc?.audiences).toEqual(['attorney']);
    expect(inc?.type).toBe('boolean');
    expect(addon?.type).toBe('price');
    expect(addon?.audiences).toEqual(['attorney']);
    expect(BASELINE_DEFAULTS.attorney.hotline).toBe(false);
    expect(BASELINE_DEFAULTS.attorney.hotline_addon_price_cents).toBeNull();
    expect(BASELINE_DEFAULTS.client.hotline).toBeUndefined();
    // the plan editor keeps a price and an empty price
    expect(
      sanitizeEntitlements('attorney', {
        hotline: false,
        hotline_addon_price_cents: 1900,
      }),
    ).toEqual({ hotline: false, hotline_addon_price_cents: 1900 });
    expect(
      sanitizeEntitlements('attorney', { hotline_addon_price_cents: null }),
    ).toEqual({ hotline_addon_price_cents: null });
  });
});

describe('decideHotlineAccess (owner 16.11 ~19:45, per plan)', () => {
  it('«Бесплатно для всех» (start): every attorney, whatever the plan', () => {
    expect(decideHotlineAccess({ ...base, freeForAll: true })).toEqual({
      allowed: true,
      via: 'free',
    });
  });

  it('«Входит в тариф»: allowed', () => {
    expect(decideHotlineAccess({ ...base, included: true })).toEqual({
      allowed: true,
      via: 'plan',
    });
  });

  it('«Отдельное дополнение $N»: only once bought', () => {
    const addon = { ...base, addonPriceCents: 1900 };
    expect(decideHotlineAccess(addon)).toEqual({
      allowed: false,
      reason: 'addon_required',
    });
    expect(decideHotlineAccess({ ...addon, addonActive: true })).toEqual({
      allowed: true,
      via: 'addon',
    });
  });

  it('«Недоступно»: refused', () => {
    expect(decideHotlineAccess(base)).toEqual({
      allowed: false,
      reason: 'not_in_plan',
    });
  });

  it('trial in days: from the first «Ожидать звонки», then over', () => {
    const t = { ...base, addonPriceCents: 1900, trialDays: 7 };
    expect(decideHotlineAccess(t).allowed).toBe(true); // never used yet
    expect(
      decideHotlineAccess({ ...t, firstOnlineAt: t.now - 6 * DAY }),
    ).toEqual({ allowed: true, via: 'trial' });
    expect(
      decideHotlineAccess({ ...t, firstOnlineAt: t.now - 7 * DAY }),
    ).toEqual({ allowed: false, reason: 'addon_required' });
  });

  it('trial in minutes: talked minutes; both set = both must be left', () => {
    const t = { ...base, trialMinutes: 60 };
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
});

describe('disclosures (owner 16.11 ~19:45 / ~19:50)', () => {
  it('the owner’s texts, ru and en', () => {
    expect(HOTLINE_DISCLOSURE_TEXTS['hotline.disclosure.client_wait'].ru).toBe(
      'Звонки не записываются. Мы подбираем адвоката с лицензией в вашем штате. Разговор не делает его вашим адвокатом, пока вы не договоритесь.',
    );
    expect(
      HOTLINE_DISCLOSURE_TEXTS['hotline.disclosure.attorney_offer'].ru,
    ).toBe(
      'Звонок не записывается. Клиент из горячей линии LawBid: проверьте конфликт интересов, не давайте гарантий результата, отношения адвокат-клиент — только после вашего согласия.',
    );
    for (const t of Object.values(HOTLINE_DISCLOSURE_TEXTS)) {
      expect(t.en.length).toBeGreaterThan(10);
    }
  });

  it('first call: the full text for each role', () => {
    expect(disclosureFor('client', false, 1, false)).toMatchObject({
      key: 'hotline.disclosure.client_wait',
      kind: 'full',
      version: 1,
    });
    expect(disclosureFor('attorney', false, 1, false)).toMatchObject({
      key: 'hotline.disclosure.attorney_offer',
      kind: 'full',
    });
  });

  it('repeat call: nothing, or the short line when the admin switch is on', () => {
    expect(disclosureFor('client', true, 1, false)).toMatchObject({
      key: null,
      kind: null,
      ru: null,
    });
    expect(disclosureFor('attorney', true, 1, true)).toMatchObject({
      key: 'hotline.notice.short',
      kind: 'short',
      ru: 'Звонки не записываются',
    });
  });

  it('the acknowledgement is per person, role and text version (a new version shows again)', () => {
    expect(ackField('u1', 'client', 1)).not.toBe(ackField('u1', 'client', 2));
    expect(ackField('u1', 'client', 1)).not.toBe(ackField('u1', 'attorney', 1));
  });
});
