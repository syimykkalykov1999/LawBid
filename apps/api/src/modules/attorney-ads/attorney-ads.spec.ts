import { BadRequestException } from '@nestjs/common';
import { checkAdText, needsResultsDisclaimer } from './ad-rules';
import { AttorneyAdsService } from './attorney-ads.service';
import {
  mergeRules,
  parseAttorneyAdsSettings,
  DEFAULT_ATTORNEY_ADS_SETTINGS,
} from './attorney-ads.settings';

const ids = (t: string, off: string[] = []) =>
  checkAdText(t, off).map((f) => f.ruleId);

describe('checkAdText', () => {
  it('flags guarantees', () => {
    expect(ids('We guarantee you will win')).toContain('guarantee');
    expect(ids('100% success rate')).toContain('guarantee');
    expect(ids('Гарантируем результат')).toContain('guarantee');
  });
  it('flags certified specialist without a named certifier only', () => {
    expect(ids('Board certified specialist in tax')).toContain(
      'certified_specialist',
    );
    expect(ids('Certified specialist, certified by the NBTA')).not.toContain(
      'certified_specialist',
    );
  });
  it('flags superlatives, results, testimonials, referral fees', () => {
    expect(ids('The best lawyer in New York')).toContain('superlative');
    expect(ids('We recovered $2.5 million for a client')).toContain(
      'past_results',
    );
    expect(ids('Read our client testimonials')).toContain('testimonial');
    expect(ids('Earn a referral fee')).toContain('referral_payment');
  });
  it('is quiet on plain text and honours disabled rules', () => {
    expect(ids('I handle immigration and family cases in Brooklyn.')).toEqual(
      [],
    );
    expect(ids('We guarantee it', ['guarantee'])).toEqual([]);
  });
  it('knows when the results disclaimer belongs', () => {
    expect(needsResultsDisclaimer('Won a $3M verdict')).toBe(true);
    expect(needsResultsDisclaimer('Family law in Queens')).toBe(false);
  });
});

describe('settings', () => {
  it('defaults keep today: off, no archive, flags on', () => {
    const s = parseAttorneyAdsSettings(undefined);
    expect(s).toEqual(DEFAULT_ATTORNEY_ADS_SETTINGS);
    const r = mergeRules(s, ['NY']);
    expect(r.mode).toBe('off');
    expect(r.archive).toBe(false);
    expect(r.bidPacksAllowed).toBe(true);
    expect(r.referralRewardsAllowed).toBe(true);
  });
  it('ignores junk and takes the strictest state', () => {
    const s = parseAttorneyAdsSettings({
      states: {
        NY: { mode: 'warn', archive: true, retentionYears: 5 },
        NJ: { mode: 'block', bidPacksAllowed: false },
        xx: { mode: 'block' },
        CA: { mode: 'nonsense', retentionYears: 99 },
      },
    });
    expect(Object.keys(s.states).sort()).toEqual(['CA', 'NJ', 'NY']);
    const r = mergeRules(s, ['NY', 'NJ']);
    expect(r.mode).toBe('block');
    expect(r.archive).toBe(true);
    expect(r.retentionYears).toBe(5);
    expect(r.bidPacksAllowed).toBe(false);
    expect(mergeRules(s, ['CA']).mode).toBe('off');
  });
});

describe('AttorneyAdsService', () => {
  const make = (settings: unknown, states: string[]) => {
    const prisma = {
      appConfig: {
        findUnique: jest.fn().mockResolvedValue({ value: settings }),
      },
      attorneyLicense: {
        findMany: jest
          .fn()
          .mockResolvedValue(states.map((state_code) => ({ state_code }))),
      },
      state: { findMany: jest.fn().mockResolvedValue([]) },
      attorneyAdArchive: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    return { prisma, svc: new AttorneyAdsService(prisma as never) };
  };

  it('off: never blocks and never archives', async () => {
    const { prisma, svc } = make(undefined, ['NY']);
    await expect(
      svc.enforce('a', ['We guarantee wins']),
    ).resolves.toMatchObject({ blocked: false, findings: [] });
    await svc.archive('a', 'post', 'p', 'text');
    expect(prisma.attorneyAdArchive.create).not.toHaveBeenCalled();
  });

  it('block: refuses a guarantee, lets a medium finding through', async () => {
    const { svc } = make({ states: { NY: { mode: 'block' } } }, ['NY']);
    await expect(
      svc.enforce('a', ['We guarantee wins']),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.enforce('a', ['the best lawyer'])).resolves.toMatchObject({
      blocked: false,
    });
  });

  it('warn: never throws', async () => {
    const { svc } = make({ states: { NY: { mode: 'warn' } } }, ['NY']);
    await expect(
      svc.enforce('a', ['We guarantee wins']),
    ).resolves.toMatchObject({ blocked: false });
  });

  it('archive: new version only when the text changed, with retention', async () => {
    const { prisma, svc } = make(
      { states: { NY: { archive: true, retentionYears: 3 } } },
      ['NY'],
    );
    await svc.archive('a', 'post', 'p', 'hello');
    const data = prisma.attorneyAdArchive.create.mock.calls[0][0].data as {
      version: number;
      state_codes: string[];
      retain_until: Date;
      content_hash: string;
    };
    expect(data.version).toBe(1);
    expect(data.state_codes).toEqual(['NY']);
    expect(data.retain_until.getTime() - Date.now()).toBeGreaterThan(
      3 * 364 * 86_400_000,
    );
    prisma.attorneyAdArchive.findFirst.mockResolvedValue({
      version: 1,
      content_hash: data.content_hash,
    });
    prisma.attorneyAdArchive.create.mockClear();
    await svc.archive('a', 'post', 'p', 'hello');
    expect(prisma.attorneyAdArchive.create).not.toHaveBeenCalled();
    await svc.archive('a', 'post', 'p', 'hello again');
    expect(prisma.attorneyAdArchive.create.mock.calls[0][0].data.version).toBe(
      2,
    );
  });

  it('bid packs flag per state', async () => {
    const { svc } = make({ states: { NJ: { bidPacksAllowed: false } } }, [
      'NJ',
    ]);
    await expect(svc.assertBidPacksAllowed('a')).rejects.toBeDefined();
    const ok = make({ states: { NJ: { bidPacksAllowed: false } } }, ['NY']);
    await expect(ok.svc.assertBidPacksAllowed('a')).resolves.toBeUndefined();
    expect(await ok.svc.referralRewardsAllowed('a')).toBe(true);
    const rr = make({ states: { NJ: { referralRewardsAllowed: false } } }, [
      'NJ',
    ]);
    expect(await rr.svc.referralRewardsAllowed('a')).toBe(false);
  });
});
