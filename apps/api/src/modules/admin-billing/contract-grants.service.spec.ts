import type { ContractGrant } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { addMonthsUtc } from './admin-billing.util';
import { ContractGrantsService, grantStatus } from './contract-grants.service';

const DAY = 86_400_000;
const admin = { id: 'adm1', ip: null } as AdminActor;

function grant(over: Partial<ContractGrant> = {}): ContractGrant {
  const now = Date.now();
  return {
    id: 'g1',
    user_id: 'att1',
    months: 6,
    assistant_seats: 2,
    starts_at: new Date(now - DAY),
    ends_at: new Date(now + 100 * DAY),
    contract_ref: null,
    note: null,
    created_by: 'adm1',
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: new Date(now - DAY),
    updated_at: new Date(now - DAY),
    ...over,
  };
}

function setup(user: { role: string | null; deleted_at: Date | null } | null) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(user ? { id: 'att1', ...user } : null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    contractGrant: {
      create: jest.fn((a: { data: Partial<ContractGrant> }) =>
        Promise.resolve(grant(a.data)),
      ),
      findUnique: jest.fn().mockResolvedValue(grant()),
      update: jest.fn((a: { data: Partial<ContractGrant> }) =>
        Promise.resolve(grant(a.data)),
      ),
    },
  };
  const access = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = { emit: jest.fn().mockResolvedValue(null) };
  const service = new ContractGrantsService(
    prisma as unknown as PrismaService,
    access as unknown as SubscriptionAccessService,
    audit as unknown as AuditLogService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, access, audit, notifications };
}

describe('ContractGrantsService (owner 2026-10-02)', () => {
  it('creates a grant for an attorney: ends = starts + months; cache dropped; notified', async () => {
    const { service, prisma, access, notifications } = setup({
      role: 'attorney',
      deleted_at: null,
    });
    const startsAt = '2026-01-31T00:00:00.000Z';
    const r = await service.create(admin, {
      userId: 'att1',
      months: 3,
      assistantSeats: 2,
      startsAt,
    });
    const data = (
      prisma.contractGrant.create.mock.calls[0] as [
        { data: Partial<ContractGrant> },
      ]
    )[0].data;
    expect(data.ends_at?.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    expect(data.created_by).toBe('adm1');
    expect(access.invalidate).toHaveBeenCalledWith('att1');
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscription_status',
        recipientId: 'att1',
      }),
    );
    expect(r.assistantSeats).toBe(2);
  });

  it.each([
    ['a client', { role: 'client', deleted_at: null }],
    ['a deleted attorney', { role: 'attorney', deleted_at: new Date() }],
  ])('refuses %s', async (_l, user) => {
    const { service, prisma } = setup(user);
    await expect(
      service.create(admin, { userId: 'att1', months: 3 }),
    ).rejects.toMatchObject({
      response: { code: 'CONTRACT_GRANT_NOT_ATTORNEY' },
    });
    expect(prisma.contractGrant.create).not.toHaveBeenCalled();
  });

  it('unknown user → 404', async () => {
    const { service } = setup(null);
    await expect(
      service.create(admin, { userId: 'att1', months: 3 }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('extend adds months to the end date, at most 24 in total', async () => {
    const { service, prisma, access } = setup({
      role: 'attorney',
      deleted_at: null,
    });
    const g = grant({ months: 12 });
    prisma.contractGrant.findUnique.mockResolvedValue(g);
    await service.extend(admin, 'g1', 6);
    expect(prisma.contractGrant.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { months: 18, ends_at: addMonthsUtc(g.ends_at, 6) },
    });
    expect(access.invalidate).toHaveBeenCalledWith('att1');

    prisma.contractGrant.findUnique.mockResolvedValue(grant({ months: 20 }));
    await expect(service.extend(admin, 'g1', 5)).rejects.toMatchObject({
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('revoke sets revoked_* and drops the cache; twice → 409', async () => {
    const { service, prisma, access, audit } = setup({
      role: 'attorney',
      deleted_at: null,
    });
    const r = await service.revoke(admin, 'g1', 'contract ended early');
    expect(r.status).toBe('revoked');
    expect(r.revokeReason).toBe('contract ended early');
    expect(access.invalidate).toHaveBeenCalledWith('att1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.contract_grant.revoke' }),
    );
    prisma.contractGrant.findUnique.mockResolvedValue(
      grant({ revoked_at: new Date() }),
    );
    await expect(
      service.revoke(admin, 'g1', 'contract ended early'),
    ).rejects.toMatchObject({ response: { code: 'CONTRACT_GRANT_REVOKED' } });
  });

  it('grantStatus', () => {
    const now = new Date();
    expect(grantStatus(grant(), now)).toBe('active');
    expect(
      grantStatus(grant({ starts_at: new Date(now.getTime() + DAY) }), now),
    ).toBe('scheduled');
    expect(
      grantStatus(grant({ ends_at: new Date(now.getTime() - DAY) }), now),
    ).toBe('expired');
    expect(grantStatus(grant({ revoked_at: now }), now)).toBe('revoked');
  });

  it('addMonthsUtc clamps to the month end', () => {
    expect(
      addMonthsUtc(new Date('2026-01-31T10:00:00Z'), 1).toISOString(),
    ).toBe('2026-02-28T10:00:00.000Z');
    expect(
      addMonthsUtc(new Date('2026-11-15T00:00:00Z'), 3).toISOString(),
    ).toBe('2027-02-15T00:00:00.000Z');
  });
});
