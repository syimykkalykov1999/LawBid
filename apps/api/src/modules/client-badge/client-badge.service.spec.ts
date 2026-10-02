import { ConflictException } from '@nestjs/common';
import { ClientBadgeService } from './client-badge.service';

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

function setup(current: ReturnType<typeof row> | null) {
  let stored = current;
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: 'client', email: null }),
    },
    clientVerification: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
      upsert: jest.fn().mockImplementation(({ create }) => {
        stored = row({ ...create, status: 'pending' });
        return Promise.resolve(stored);
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        stored = { ...(stored as ReturnType<typeof row>), ...data };
        return Promise.resolve(stored);
      }),
    },
  };
  const notifications = { emit: jest.fn().mockResolvedValue(undefined) };
  const files = { assertAttachable: jest.fn().mockResolvedValue({}) };
  const settings = { number: jest.fn().mockResolvedValue(1000) };
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

  it('submit: attaches the files and queues a pending request', async () => {
    const { service, files } = setup(null);
    const s = await service.submit('u1', {
      fileIds: ['a', 'a', 'b'],
    });
    expect(files.assertAttachable).toHaveBeenCalledTimes(2);
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
