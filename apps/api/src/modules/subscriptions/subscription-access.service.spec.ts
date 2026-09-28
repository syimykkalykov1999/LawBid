import type { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionAccessService } from './subscription-access.service';

describe('SubscriptionAccessService (stub until docs/06 stage 6.7)', () => {
  const withProfile = (profile: { verification_status: string } | null) => {
    const findUnique = jest.fn().mockResolvedValue(profile);
    return {
      findUnique,
      service: new SubscriptionAccessService({
        attorneyProfile: { findUnique },
      } as unknown as PrismaService),
    };
  };

  it('a verified attorney counts as active', async () => {
    const { service, findUnique } = withProfile({
      verification_status: 'verified',
    });
    expect(await service.isActive('a1')).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { user_id: 'a1' },
      select: { verification_status: true },
    });
  });

  it.each(['unverified', 'pending', 'rejected', 'suspended'])(
    '%s attorney is not active',
    async (status) => {
      expect(
        await withProfile({ verification_status: status }).service.isActive(
          'a1',
        ),
      ).toBe(false);
    },
  );

  it('no attorney profile (e.g. a client) is not active', async () => {
    expect(await withProfile(null).service.isActive('c1')).toBe(false);
  });
});
