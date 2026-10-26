import { ConflictException } from '@nestjs/common';
import { ClientBadgeService } from './client-badge.service';
import { sanitizeUploadLimits } from '../files/upload-limits';
import { FakePaymentProvider } from '../billing/fake-payment.provider';

const NOW = Date.now();
const row = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  user_id: 'u1',
  status: 'approved',
  sub_status: 'none',
  current_period_end: null,
  cancel_at_period_end: false,
  stripe_subscription_id: 'sub_1',
  stripe_checkout_id: 'cs_1',
  submitted_at: new Date(),
  reject_reason: null,
  revoke_reason: null,
  ...over,
});

function setup(current: ReturnType<typeof row> | null, autoApprove = true) {
  let stored = current;
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: 'client', email: null }),
    },
    clientVerification: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
      upsert: jest.fn().mockImplementation(({ create }) => {
        stored = row({ ...create });
        return Promise.resolve(stored);
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        stored = { ...(stored as ReturnType<typeof row>), ...data };
        return Promise.resolve(stored);
      }),
    },
  };
  const notifications = { emit: jest.fn().mockResolvedValue(undefined) };
  const files = {
    assertAttachable: jest.fn().mockResolvedValue({}),
    uploadLimits: jest.fn().mockResolvedValue(sanitizeUploadLimits(undefined)),
  };
  const settings = {
    number: jest.fn().mockResolvedValue(1000),
    boolean: jest.fn().mockResolvedValue(autoApprove),
  };
  const service = new ClientBadgeService(
    prisma as never,
    { get: jest.fn() } as never,
    settings as never,
    files as never,
    notifications as never,
  );
  return { service, prisma, notifications, files };
}

describe('ClientBadgeService', () => {
  it('state: no request yet → can submit, no badge, price from settings', async () => {
    const { service } = setup(null);
    expect(await service.state('u1')).toMatchObject({
      status: 'none',
      badgeActive: false,
      priceCents: 1000,
      canSubmit: true,
      canSubscribe: false,
    });
  });

  it('submit: attaches the files and approves at once (automation principle)', async () => {
    const { service, files, notifications } = setup(null);
    const s = await service.submit('u1', {
      fileIds: ['a', 'a', 'b'],
    });
    expect(files.assertAttachable).toHaveBeenCalledTimes(2);
    expect(s.status).toBe('approved');
    expect(s.canSubscribe).toBe(true);
    expect(notifications.emit).toHaveBeenCalledTimes(1);
  });

  it('submit: with the auto switch off the request waits in the queue', async () => {
    const { service } = setup(null, false);
    const s = await service.submit('u1', { fileIds: ['a'] });
    expect(s.status).toBe('pending');
  });

  it('submit: a second request while one is pending is refused', async () => {
    const { service } = setup(row({ status: 'pending' }));
    await expect(
      service.submit('u1', { fileIds: ['a'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a paid subscription turns the badge on and tells the client', async () => {
    const { service, notifications } = setup(row());
    await service.applySubscription({
      id: 'sub_1',
      customerId: 'cus',
      status: 'active',
      currentPeriodEnd: Math.floor(NOW / 1000) + 30 * 86400,
      cancelAtPeriodEnd: false,
    } as never);
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'verification_update',
        payload: { kind: 'client_badge', status: 'badge_on' },
      }),
    );
  });

  it('a failed payment turns the badge off', async () => {
    const { service, notifications } = setup(
      row({
        sub_status: 'active',
        current_period_end: new Date(NOW + 86400000),
      }),
    );
    await service.applySubscription({
      id: 'sub_1',
      customerId: 'cus',
      status: 'past_due',
      currentPeriodEnd: Math.floor(NOW / 1000) + 86400,
      cancelAtPeriodEnd: false,
    } as never);
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { kind: 'client_badge', status: 'approved' },
      }),
    );
  });
});

// Owner 2026-10-22 («лечи всё»): the badge is bought on our card page — the
// card is saved there (SetupIntent) and the $10/month subscription is made
// on it, instead of Stripe's hosted page.
describe('ClientBadgeService on the card page', () => {
  function pageSetup() {
    const provider = new FakePaymentProvider();
    let stored: ReturnType<typeof row> = row({
      stripe_subscription_id: null,
      stripe_checkout_id: null,
    });
    const customers = new Map<string, string>();
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ role: 'client', email: null }),
      },
      clientVerification: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        update: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve(stored);
        }),
        updateMany: jest.fn().mockImplementation(({ data }) => {
          stored = { ...stored, ...data };
          return Promise.resolve({ count: 1 });
        }),
      },
      stripeCustomer: {
        findUnique: jest.fn(({ where }: { where: { user_id: string } }) =>
          Promise.resolve(
            customers.has(where.user_id)
              ? { stripe_customer_id: customers.get(where.user_id) }
              : null,
          ),
        ),
        upsert: jest.fn(
          ({
            create,
          }: {
            create: { user_id: string; stripe_customer_id: string };
          }) => {
            customers.set(create.user_id, create.stripe_customer_id);
            return Promise.resolve(create);
          },
        ),
      },
    };
    const payLink = {
      enabled: jest.fn().mockResolvedValue(true),
      link: jest.fn().mockResolvedValue({
        url: 'https://lawbid.dev/pay.html#t=x',
        id: 'x',
        token: 'x',
      }),
    };
    const service = new ClientBadgeService(
      prisma as never,
      { get: jest.fn() } as never,
      {
        number: jest.fn().mockResolvedValue(1000),
        boolean: jest.fn().mockResolvedValue(true),
      } as never,
      {} as never,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      provider,
      {
        priceId: jest.fn().mockResolvedValue('price_badge'),
        amount: jest.fn().mockResolvedValue(1000),
      } as never,
      undefined,
      payLink as never,
    );
    return { service, provider, payLink, stored: () => stored };
  }

  it('checkout: the card page link, not a Stripe session', async () => {
    const { service, payLink } = pageSetup();
    expect(await service.checkout('u1', 'https://api.x/api/v1')).toEqual({
      checkoutUrl: 'https://lawbid.dev/pay.html#t=x',
    });
    expect(payLink.link).toHaveBeenCalledWith(
      'u1',
      { kind: 'client_badge' },
      'https://api.x/api/v1',
    );
  });

  it('the saved card gets the subscription; an unsaved card is refused', async () => {
    const { service, provider, stored } = pageSetup();
    const s = await service.payPageSession('u1');
    expect(s.priceCents).toBe(1000);
    await expect(service.payPageConfirm('u1', s.setupIntentId)).rejects.toThrow(
      'The card was not saved.',
    );
    provider.confirmSetupIntent(s.setupIntentId, {
      paymentMethodId: 'pm_badge',
      fingerprint: 'fp',
    });
    await service.payPageConfirm('u1', s.setupIntentId);
    const sub = stored().stripe_subscription_id;
    expect(sub).toMatch(/^sub_fake_/);
    expect(stored().stripe_checkout_id).toBe(s.setupIntentId);
    const remote = await provider.retrieveSubscription(String(sub));
    expect(remote?.defaultPaymentMethodId).toBe('pm_badge');
    expect(remote?.metadata).toMatchObject({
      kind: 'client_badge',
      userId: 'u1',
    });
  });
});
