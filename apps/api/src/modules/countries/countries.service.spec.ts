import type { PrismaService } from '../../prisma/prisma.service';
import {
  COUNTRIES,
  EXTRA_REGIONS,
  REGION_CODE_RE,
} from '../../common/reference-data/countries';
import { US_STATES } from '../../common/reference-data/us-states';
import { CountriesService } from './countries.service';
import { countryInScope, userInScope } from './country-scope';

const US = {
  code: 'US',
  name: 'United States',
  is_enabled: true,
  calling_code: '1',
  currency: 'USD',
  language: 'en',
  region_kind: 'state',
  timezone: 'America/New_York',
  stripe_supported: true,
  sort: 1,
  enabled_at: null,
  updated_at: new Date(),
  states: [{ code: 'NY', name: 'New York', iso_code: 'US-NY' }],
};

function service(regionCountries = ['US', 'CA', 'MX']) {
  const prisma = {
    country: { findMany: jest.fn().mockResolvedValue([US]) },
    state: {
      groupBy: jest
        .fn()
        .mockResolvedValue(regionCountries.map((c) => ({ country_code: c }))),
    },
  };
  return {
    svc: new CountriesService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('CountriesService (owner 2026-10-05)', () => {
  it('lists switched-on countries with their regions, cached', async () => {
    const { svc, prisma } = service();
    const list = await svc.enabled();
    expect(list).toEqual([
      expect.objectContaining({
        code: 'US',
        callingCode: '1',
        currency: 'USD',
        regions: [{ code: 'NY', name: 'New York', isoCode: 'US-NY' }],
      }),
    ]);
    await svc.enabled();
    expect(prisma.country.findMany).toHaveBeenCalledTimes(1);
    svc.invalidate();
    await svc.enabled();
    expect(prisma.country.findMany).toHaveBeenCalledTimes(2);
  });

  it('SMS goes to switched-on countries plus extra territories without regions', async () => {
    const { svc } = service();
    // CA has regions, so its own switch decides — the stored list cannot
    // sneak it in; PR has none, so the stored list may add it.
    expect((await svc.smsCountries(['US', 'PR', 'CA'])).sort()).toEqual([
      'PR',
      'US',
    ]);
  });

  it('finds the country of a phone number', () => {
    const { svc } = service();
    expect(svc.countryOfPhone('+13125550140')).toBe('US');
    expect(svc.countryOfPhone('+14165550123')).toBe('CA');
    expect(svc.countryOfPhone('+525512345678')).toBe('MX');
    expect(svc.countryOfPhone(null)).toBeNull();
  });
});

describe('reference data', () => {
  it('lists every country once, US first and switched on by the migration', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.slice(0, 3)).toEqual(['US', 'CA', 'MX']);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.currency).toMatch(/^[A-Z]{3}$/);
      expect(c.callingCode).toMatch(/^\d{1,4}$/);
    }
  });

  it('region codes never clash across countries', () => {
    const all = [
      ...US_STATES.map((s) => s.code),
      ...EXTRA_REGIONS.map((r) => r.code),
    ];
    expect(new Set(all).size).toBe(all.length);
    for (const code of all) expect(code).toMatch(REGION_CODE_RE);
  });
});

describe('country scope', () => {
  it('limits people to the scope, or not at all', () => {
    expect(userInScope(null)).toEqual({});
    expect(userInScope(['CA'])).toEqual({ country_code: { in: ['CA'] } });
    expect(countryInScope(null, 'US')).toBe(true);
    expect(countryInScope(['CA'], 'US')).toBe(false);
    expect(countryInScope(['CA'], 'CA')).toBe(true);
  });
});
