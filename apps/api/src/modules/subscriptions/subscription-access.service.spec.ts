import type Redis from 'ioredis';
import type { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionAccessService } from './subscription-access.service';

const DAY = 86_400_000;

function setup(row: { status: string; grace_ends_at: Date | null } | null) {
  const store = new Map<string, string>();
  const findUnique = jest.fn().mockResolvedValue(row);
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
  const prisma = { subscription: { findUnique } } as unknown as PrismaService;
  return {
    service: new SubscriptionAccessService(prisma, redis),
    findUnique,
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
      } as never),
    ).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
});
