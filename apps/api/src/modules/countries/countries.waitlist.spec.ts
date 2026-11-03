import type { PrismaService } from '../../prisma/prisma.service';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';

function setup(enabled = false) {
  const prisma = {
    country: {
      findUnique: jest.fn().mockResolvedValue({ is_enabled: enabled }),
    },
    countryWaitlist: {
      upsert: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  return {
    prisma,
    svc: new CountriesService(prisma as unknown as PrismaService),
  };
}

describe('country waiting list without an e-mail (owner 2026-11-02)', () => {
  it('an address-less request records one vote row', async () => {
    const { svc, prisma } = setup();
    await expect(svc.joinWaitlist('de', undefined, 'de')).resolves.toEqual({
      countryCode: 'DE',
      available: false,
    });
    expect(prisma.countryWaitlist.create).toHaveBeenCalledWith({
      data: { country_code: 'DE', locale: 'de' },
    });
    expect(prisma.countryWaitlist.upsert).not.toHaveBeenCalled();
  });

  it('over the visitor limit it answers the same and records nothing', async () => {
    const { svc, prisma } = setup();
    await expect(
      svc.joinWaitlist('DE', undefined, undefined, false),
    ).resolves.toEqual({ countryCode: 'DE', available: false });
    expect(prisma.countryWaitlist.create).not.toHaveBeenCalled();
  });

  it('an address keeps the old behaviour (one row per country + address)', async () => {
    const { svc, prisma } = setup();
    await svc.joinWaitlist('DE', ' A@Example.com ', 'en');
    expect(prisma.countryWaitlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          country_code_email: { country_code: 'DE', email: 'a@example.com' },
        },
      }),
    );
    expect(prisma.countryWaitlist.create).not.toHaveBeenCalled();
  });

  it('an open country needs no waiting', async () => {
    const { svc, prisma } = setup(true);
    await expect(svc.joinWaitlist('DE', undefined, undefined)).resolves.toEqual(
      { countryCode: 'DE', available: true },
    );
    expect(prisma.countryWaitlist.create).not.toHaveBeenCalled();
  });
});

describe('waiting list vote limit', () => {
  function ctrl(consume: jest.Mock) {
    const countries = {
      joinWaitlist: jest
        .fn()
        .mockResolvedValue({ countryCode: 'DE', available: false }),
    };
    return {
      countries,
      c: new CountriesController(
        countries as never,
        {
          consumeFixedWindow: consume,
        } as never,
      ),
    };
  }
  const dto = { countryCode: 'DE' };
  const req = (ip: string) => ({ ip }) as never;

  it('first vote of the day per country counts; keys use the IPv6 /64', async () => {
    const consume = jest.fn().mockResolvedValue({ allowed: true });
    const { c, countries } = ctrl(consume);
    await c.joinCountryWaitlist(dto, req('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
    expect(consume).toHaveBeenNthCalledWith(
      1,
      ['waitlist-vote', '2001:db8:1:2', 'DE'],
      1,
      86_400,
    );
    expect(consume).toHaveBeenNthCalledWith(
      2,
      ['waitlist-vote', '2001:db8:1:2'],
      30,
      86_400,
    );
    expect(countries.joinWaitlist).toHaveBeenCalledWith(
      'DE',
      undefined,
      undefined,
      true,
    );
  });

  it('a second vote for the same country the same day is not recorded', async () => {
    const consume = jest.fn().mockResolvedValueOnce({ allowed: false });
    const { c, countries } = ctrl(consume);
    await c.joinCountryWaitlist(dto, req('198.51.100.7'));
    expect(countries.joinWaitlist).toHaveBeenCalledWith(
      'DE',
      undefined,
      undefined,
      false,
    );
  });

  it('the per-visitor daily ceiling stops further countries', async () => {
    const consume = jest
      .fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    const { c, countries } = ctrl(consume);
    await c.joinCountryWaitlist(dto, req('198.51.100.7'));
    expect(countries.joinWaitlist.mock.calls[0][3]).toBe(false);
  });

  it('with an address the limiter is not touched', async () => {
    const consume = jest.fn();
    const { c, countries } = ctrl(consume);
    await c.joinCountryWaitlist(
      { ...dto, email: 'a@example.com' },
      req('198.51.100.7'),
    );
    expect(consume).not.toHaveBeenCalled();
    expect(countries.joinWaitlist.mock.calls[0][3]).toBe(true);
  });

  it('Redis down: the vote still counts', async () => {
    const consume = jest.fn().mockRejectedValue(new Error('redis down'));
    const { c, countries } = ctrl(consume);
    await c.joinCountryWaitlist(dto, req('198.51.100.7'));
    expect(countries.joinWaitlist.mock.calls[0][3]).toBe(true);
  });
});
