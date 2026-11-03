import { AdminPricingService } from './admin-pricing.service';

const ROW_ID = '0b0e7c1e-6c1f-4a53-9d2e-5d1f6f1f2a10';
const ADMIN = {
  id: '5f0f5b46-3f0b-4d8e-9a77-2d6c0c8e9b11',
  ip: '127.0.0.1',
} as never;

function build(activeRow: { id: string } | undefined) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const pricing = {
    requirePriceId: jest.fn().mockResolvedValue('price_new'),
    knownPriceIds: jest.fn().mockResolvedValue(['price_new', 'price_old']),
    amounts: jest
      .fn()
      .mockResolvedValue({ monthly: 399, seat: 100, yearly: 0 }),
    activeRows: jest
      .fn()
      .mockResolvedValue(new Map(activeRow ? [['monthly', activeRow]] : [])),
  };
  const prisma = {
    subscription: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 's1', stripe_subscription_id: 'sub_1', assistant_seats: 0 },
        ]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const provider = { replaceItemPrice: jest.fn().mockResolvedValue(true) };
  const svc = new AdminPricingService(
    prisma as never,
    pricing as never,
    audit as never,
    provider as never,
  );
  return { svc, audit };
}

describe('AdminPricingService.moveSubscribers audit row', () => {
  it('records the price row UUID as target, never the kind name', async () => {
    const { svc, audit } = build({ id: ROW_ID });
    await expect(
      svc.moveSubscribers(ADMIN, 'monthly', 'move to today price'),
    ).resolves.toEqual({ moved: 1, skipped: 0, failed: 0 });
    const entry = audit.record.mock.calls[0][0];
    expect(entry.targetId).toBe(ROW_ID);
    expect(entry.after.kind).toBe('monthly');
  });

  it('records no target (null) when the kind has no price row yet', async () => {
    const { svc, audit } = build(undefined);
    await svc.moveSubscribers(ADMIN, 'monthly', 'move to today price');
    expect(audit.record.mock.calls[0][0].targetId).toBeNull();
  });
});
