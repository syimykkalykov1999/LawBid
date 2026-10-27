import { BadRequestException } from '@nestjs/common';
import { AdminPromotionsService } from './admin-promotions.service';
import {
  DEFAULT_PROMOTION_SETTINGS,
  PROMOTION_SETTINGS_KEY,
  type PricingMatrix,
} from './promotions.settings';

/**
 * PUT /admin/promotions/settings: a field that is not sent keeps its stored
 * value (the request DTO is all-optional), and feedEveryN stays inside
 * 10-15 (the DTO still accepts the old 2-50, the service narrows it).
 */
describe('AdminPromotionsService.updateSettings', () => {
  const stored = { ...DEFAULT_PROMOTION_SETTINGS, priceCentsPerDay: 777 };
  const upsert = jest.fn();
  const tx = {
    appConfig: { findUnique: jest.fn(() => null), upsert },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const promotions = { settings: jest.fn(() => Promise.resolve(stored)) };
  const audit = { record: jest.fn() };
  const service = new AdminPromotionsService(
    prisma as never,
    promotions as never,
    {} as never,
    audit as never,
  );
  const admin = { id: 'a1', ip: '127.0.0.1' } as never;

  beforeEach(() => upsert.mockClear());

  it('keeps the stored value of a field that was not sent', async () => {
    const next = await service.updateSettings(admin, { maxDays: 20 });
    expect(next.maxDays).toBe(20);
    expect(next.priceCentsPerDay).toBe(777);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: PROMOTION_SETTINGS_KEY } }),
    );
  });

  it('refuses feedEveryN outside 10-15 (the old 2-50 range is accepted by the DTO only)', async () => {
    await expect(
      service.updateSettings(admin, { feedEveryN: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateSettings(admin, { feedEveryN: 30 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateSettings(admin, { feedEveryN: 12 }),
    ).resolves.toMatchObject({ feedEveryN: 12 });
  });

  describe('prices per way to pay (owner 2026-10-27)', () => {
    const matrix = (edit: (m: PricingMatrix) => void): PricingMatrix => {
      const m = JSON.parse(
        JSON.stringify(DEFAULT_PROMOTION_SETTINGS.pricing),
      ) as PricingMatrix;
      edit(m);
      return m;
    };
    const turnOnTaps = (m: PricingMatrix) => {
      m.post.models.clicks = { enabled: true, priceCents: 33 };
    };

    it('saves a new price and switch, with its own audit label', async () => {
      const next = await service.updateSettings(admin, {
        pricing: matrix(turnOnTaps),
      });
      expect(next.pricing.post.models.clicks).toEqual({
        enabled: true,
        priceCents: 33,
      });
      // Nothing else moved.
      expect(next.pricing.case).toEqual(
        DEFAULT_PROMOTION_SETTINGS.pricing.case,
      );
      expect(next.priceCentsPerDay).toBe(777);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'promotions.pricing' }),
        expect.anything(),
      );
    });

    it('an ordinary change keeps the ordinary audit label', async () => {
      audit.record.mockClear();
      await service.updateSettings(admin, { maxDays: 21 });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'promotions.settings' }),
        expect.anything(),
      );
    });

    it('asks for step-up only when a price or switch really changes', async () => {
      expect(await service.pricingWouldChange({ maxDays: 5 })).toBe(false);
      expect(
        await service.pricingWouldChange({
          pricing: DEFAULT_PROMOTION_SETTINGS.pricing,
        }),
      ).toBe(false);
      expect(
        await service.pricingWouldChange({ pricing: matrix(turnOnTaps) }),
      ).toBe(true);
      expect(await service.pricingWouldChange({ cpmCents: 900 })).toBe(true);
    });

    it('an older admin build that only sends the CPM moves the views price', async () => {
      const next = await service.updateSettings(admin, { cpmCents: 900 });
      expect(next.pricing.post.models.impressions.priceCents).toBe(900);
      expect(next.pricing.video.models.impressions.priceCents).toBe(900);
      expect(next.pricing.case.models.impressions.priceCents).toBe(900);
      expect(next.pricing.profile.models.impressions.priceCents).toBe(
        DEFAULT_PROMOTION_SETTINGS.pricing.profile.models.impressions
          .priceCents,
      );
      expect(next.cpmCents).toBe(900);
    });
  });
});
