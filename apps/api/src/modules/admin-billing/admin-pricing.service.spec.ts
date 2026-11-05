import {
  AdminPricingService,
  SITE_REBUILD_COOLDOWN_MS,
} from './admin-pricing.service';

const ROW_ID = '0b0e7c1e-6c1f-4a53-9d2e-5d1f6f1f2a10';
const ADMIN = {
  id: '5f0f5b46-3f0b-4d8e-9a77-2d6c0c8e9b11',
  ip: '127.0.0.1',
} as never;

function build(
  activeRow: { id: string } | undefined,
  github: { configured: jest.Mock; dispatchWorkflow: jest.Mock } = {
    configured: jest.fn().mockResolvedValue(false),
    dispatchWorkflow: jest.fn(),
  },
) {
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
    github as never,
  );
  return { svc, audit, github };
}

describe('AdminPricingService.rebuildPublicSite (R-399)', () => {
  const app = () => ({
    configured: jest.fn().mockResolvedValue(true),
    dispatchWorkflow: jest.fn().mockResolvedValue({ repo: 'o/r' }),
  });

  it('starts seo-deploy.yml once per cooldown after a price change', async () => {
    const github = app();
    const { svc } = build(undefined, github);
    await expect(svc.rebuildPublicSite(1_000)).resolves.toBe(true);
    await expect(svc.rebuildPublicSite(2_000)).resolves.toBe(false);
    await expect(
      svc.rebuildPublicSite(1_000 + SITE_REBUILD_COOLDOWN_MS),
    ).resolves.toBe(true);
    expect(github.dispatchWorkflow).toHaveBeenCalledTimes(2);
    expect(github.dispatchWorkflow).toHaveBeenCalledWith('seo-deploy.yml', {});
  });

  it('does nothing without the GitHub App (the daily run applies)', async () => {
    const { svc, github } = build(undefined);
    await expect(svc.rebuildPublicSite(1_000)).resolves.toBe(false);
    expect(github.dispatchWorkflow).not.toHaveBeenCalled();
  });

  it('never throws and allows a retry when GitHub refuses', async () => {
    const github = app();
    github.dispatchWorkflow.mockRejectedValueOnce(new Error('HTTP 422'));
    const { svc } = build(undefined, github);
    await expect(svc.rebuildPublicSite(1_000)).resolves.toBe(false);
    await expect(svc.rebuildPublicSite(2_000)).resolves.toBe(true);
  });
});

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
