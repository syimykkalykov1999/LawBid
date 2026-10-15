import { BadRequestException } from '@nestjs/common';
import { AdminPromotionsService } from './admin-promotions.service';
import {
  DEFAULT_PROMOTION_SETTINGS,
  PROMOTION_SETTINGS_KEY,
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
});
