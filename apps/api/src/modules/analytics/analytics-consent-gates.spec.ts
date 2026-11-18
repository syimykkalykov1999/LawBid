import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import { ConsentsService } from '../users/services/consents.service';
import type { AnalyticsConsentService } from './analytics-consent.service';
import { AnalyticsService } from './analytics.service';
import type { AppEventsService } from './app-events.service';

const USER = '11111111-1111-4111-8111-111111111111';

function analytics(allowed: boolean) {
  const prisma = { $executeRaw: jest.fn().mockResolvedValue(1) };
  const redis = { set: jest.fn().mockResolvedValue('OK') };
  const consent = { allowed: jest.fn().mockResolvedValue(allowed) };
  const service = new AnalyticsService(
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
    {} as AppEventsService,
    undefined,
    consent as unknown as AnalyticsConsentService,
  );
  return { service, prisma, redis, consent };
}

describe('verify 18.11 (batch 10): analytics consent gates', () => {
  it('AN1: a person who said no (or «Do not sell») is not written to user_activity_days', async () => {
    const { service, prisma, redis, consent } = analytics(false);
    service.touch(USER);
    await service.idle();
    expect(consent.allowed).toHaveBeenCalledWith(USER);
    expect(redis.set).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('AN1: an allowed person is still counted once a day', async () => {
    const { service, prisma } = analytics(true);
    service.touch(USER);
    await service.idle();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('AN3: a «Do not sell» answer saved as a consent drops the cached gate at once', async () => {
    const prisma = { userConsent: { createMany: jest.fn() } };
    const gate = { invalidate: jest.fn() };
    const consents = new ConsentsService(
      prisma as unknown as PrismaService,
      gate as unknown as AnalyticsConsentService,
    );
    await consents.save(
      USER,
      { consents: [{ type: 'do_not_sell', granted: true }] } as never,
      { ip: '1.1.1.1' },
    );
    expect(gate.invalidate).toHaveBeenCalledWith(USER);
  });
});
