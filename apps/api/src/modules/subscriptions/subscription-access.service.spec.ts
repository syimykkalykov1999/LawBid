import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionAccessService } from './subscription-access.service';

const DAY = 86_400_000;

type Grant = {
  id: string;
  ends_at: Date;
  assistant_seats: number;
};

function setup(
  row: { status: string; grace_ends_at: Date | null } | null,
  grants: Grant[] = [],
) {
  const store = new Map<string, string>();
  const findUnique = jest.fn().mockResolvedValue(row);
  const grantFindMany = jest.fn().mockResolvedValue(grants);
  const get = jest.fn((k: string) => Promise.resolve(store.get(k) ?? null));
  const set = jest.fn((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve('OK');
  });
  const del = jest.fn((k: string) => {
    store.delete(k);
    return Promise.resolve(1);
  });
  const redis = { get, set, del } as unknown as Redis;
  const prisma = {
    subscription: { findUnique },
    contractGrant: { findMany: grantFindMany },
  } as unknown as PrismaService;
  return {
    service: new SubscriptionAccessService(prisma, redis),
    findUnique,
    grantFindMany,
    get,
    set,
    store,
  };
}

describe('SubscriptionAccessService (docs/06 §1.2)', () => {
  it.each([
    ['trialing', null, true],
    ['active', null, true],
    ['past_due within grace', new Date(Date.now() + DAY), true],
    ['past_due after grace', new Date(Date.now() - DAY), false],
    ['canceled', null, false],
    ['expired', null, false],
    ['incomplete', null, false],
  ])('%s', async (label, grace, expected) => {
    const status = label.split(' ')[0];
    const { service } = setup({ status, grace_ends_at: grace });
    expect(await service.isActive('a1')).toBe(expected);
  });

  it('no subscription row → not active', async () => {
    expect(await setup(null).service.isActive('a1')).toBe(false);
  });

  it('caches the verdict for 60 s and invalidate() drops it', async () => {
    const { service, findUnique, set } = setup({
      status: 'active',
      grace_ends_at: null,
    });
    await service.isActive('a1');
    await service.isActive('a1');
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('sub:active:a1', '1', 'EX', 60);
    await service.invalidate('a1');
    await service.isActive('a1');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('a transaction client bypasses the cache (bid-accept re-check)', async () => {
    const { service, get, store } = setup({
      status: 'active',
      grace_ends_at: null,
    });
    store.set('sub:active:a1', '1');
    const txFind = jest
      .fn()
      .mockResolvedValue({ status: 'canceled', grace_ends_at: null });
    expect(
      await service.isActive('a1', {
        subscription: { findUnique: txFind },
        contractGrant: { findMany: jest.fn().mockResolvedValue([]) },
      } as never),
    ).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  describe('contract grants (owner 2026-10-02)', () => {
    const grant = (days: number, seats = 0): Grant => ({
      id: 'g1',
      ends_at: new Date(Date.now() + days * DAY),
      assistant_seats: seats,
    });

    it('an active grant makes an attorney without a subscription active', async () => {
      const { service, grantFindMany } = setup(null, [grant(30)]);
      expect(await service.isActive('a1')).toBe(true);
      const where = (
        grantFindMany.mock.calls[0] as [{ where: Record<string, unknown> }]
      )[0].where;
      expect(where.user_id).toBe('a1');
      expect(where.revoked_at).toBeNull();
      expect(where.starts_at).toEqual({ lte: expect.any(Date) });
      expect(where.ends_at).toEqual({ gt: expect.any(Date) });
    });

    it('an active grant covers a canceled subscription', async () => {
      const { service } = setup({ status: 'canceled', grace_ends_at: null }, [
        grant(5),
      ]);
      expect(await service.isActive('a1')).toBe(true);
    });

    it('no active grant and no subscription → not active', async () => {
      expect(await setup(null, []).service.isActive('a1')).toBe(false);
    });

    it('an active Stripe row does not query grants', async () => {
      const { service, grantFindMany } = setup({
        status: 'active',
        grace_ends_at: null,
      });
      expect(await service.isActive('a1')).toBe(true);
      expect(grantFindMany).not.toHaveBeenCalled();
    });

    it('rowIsActive stays a pure Stripe-row rule', () => {
      expect(SubscriptionAccessService.rowIsActive(null)).toBe(false);
      expect(
        SubscriptionAccessService.rowIsActive({
          status: 'canceled',
          grace_ends_at: null,
        }),
      ).toBe(false);
    });

    it('activeGrant() returns the latest end and the most seats', async () => {
      const later = grant(60, 2);
      const sooner = { ...grant(10, 5), id: 'g2' };
      const { service } = setup(null, [later, sooner]);
      expect(await service.activeGrant('a1')).toEqual({
        id: 'g1',
        ends_at: later.ends_at,
        assistant_seats: 5,
      });
    });
  });
});
