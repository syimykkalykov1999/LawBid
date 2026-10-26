import {
  licenseIsLapsed,
  licenseRenewalState,
  registryMonthEnd,
} from './license-renewal';

const opts = { graceDays: 14, notifyDays: [60, 30, 7] };
const at = (d: string) => new Date(`${d}T00:00:00Z`);
const NOW = new Date('2026-10-24T05:05:00Z');

describe('licenseRenewalState (owner 2026-10-24)', () => {
  it('ok / expiring / renewal_due / expired around the date', () => {
    expect(licenseRenewalState('verified', at('2027-06-01'), NOW, opts)).toBe(
      'ok',
    );
    expect(licenseRenewalState('verified', at('2026-12-20'), NOW, opts)).toBe(
      'expiring',
    );
    expect(licenseRenewalState('verified', at('2026-10-25'), NOW, opts)).toBe(
      'expiring',
    );
    expect(licenseRenewalState('verified', at('2026-10-24'), NOW, opts)).toBe(
      'renewal_due',
    );
    expect(licenseRenewalState('verified', at('2026-10-11'), NOW, opts)).toBe(
      'renewal_due',
    );
    expect(licenseRenewalState('verified', at('2026-10-10'), NOW, opts)).toBe(
      'expired',
    );
  });

  it('grace 0 expires on the date itself', () => {
    expect(
      licenseRenewalState('verified', at('2026-10-24'), NOW, {
        ...opts,
        graceDays: 0,
      }),
    ).toBe('expired');
  });

  it('no date, or a license that is not verified, has no state', () => {
    expect(licenseRenewalState('verified', null, NOW, opts)).toBeNull();
    expect(
      licenseRenewalState('pending', at('2026-01-01'), NOW, opts),
    ).toBeNull();
    expect(licenseRenewalState('expired', null, NOW, opts)).toBe('expired');
  });
});

describe('licenseIsLapsed', () => {
  it('is true from the expiry day on, for verified licenses only', () => {
    expect(licenseIsLapsed('verified', at('2026-10-24'), NOW)).toBe(true);
    expect(licenseIsLapsed('verified', at('2026-10-25'), NOW)).toBe(false);
    expect(licenseIsLapsed('verified', null, NOW)).toBe(false);
    expect(licenseIsLapsed('pending', at('2020-01-01'), NOW)).toBe(false);
  });
});

describe('registryMonthEnd', () => {
  it('turns "Mar 2028" into the last day of that month', () => {
    expect(registryMonthEnd('Mar 2028')).toBe('2028-03-31');
    expect(registryMonthEnd('Feb 2028')).toBe('2028-02-29');
    expect(registryMonthEnd('Dec 2026')).toBe('2026-12-31');
  });
  it('refuses anything else', () => {
    expect(registryMonthEnd('2028')).toBeNull();
    expect(registryMonthEnd('Foo 2028')).toBeNull();
    expect(registryMonthEnd(null)).toBeNull();
  });
});
