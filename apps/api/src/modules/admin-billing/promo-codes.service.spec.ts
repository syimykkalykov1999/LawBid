import type { PromoCode } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { PaymentProvider } from '../billing/payment-provider';
import { PromoCodesService, promoStatus } from './promo-codes.service';

const admin = { id: 'adm1', ip: null } as AdminActor;

function promo(over: Partial<PromoCode> = {}): PromoCode {
  return {
    id: 'p1',
    code: 'BLOGGER20',
    description: null,
    discount_type: 'percent',
    percent_off: 20,
    amount_off_cents: null,
    free_days: null,
    audience: 'attorney',
    applies_to: 'any',
    max_redemptions: null,
    redeemed_count: 0,
    starts_at: null,
    expires_at: null,
    active: true,
    archived_at: null,
    stripe_coupon_id: null,
    created_by: 'adm1',
    created_at: new Date('2026-10-01T00:00:00Z'),
    updated_at: new Date('2026-10-01T00:00:00Z'),
    ...over,
  };
}

function setup(
  row: PromoCode,
  usage: { redemptions?: number; promotions?: number } = {},
) {
  const prisma = {
    promoCode: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn((a: { data: Partial<PromoCode> }) =>
        Promise.resolve({ ...row, ...a.data }),
      ),
      delete: jest.fn().mockResolvedValue(row),
    },
    promoRedemption: {
      count: jest.fn().mockResolvedValue(usage.redemptions ?? 0),
    },
    casePromotion: {
      count: jest.fn().mockResolvedValue(usage.promotions ?? 0),
    },
  };
  const provider = { name: 'fake', deleteCoupon: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PromoCodesService(
    prisma as unknown as PrismaService,
    provider as unknown as PaymentProvider,
    audit as unknown as AuditLogService,
  );
  return { service, prisma, provider, audit };
}

describe('PromoCodesService.remove (owner 2026-10-05)', () => {
  it('deletes an unused code for good', async () => {
    const { service, prisma, audit } = setup(promo());
    await expect(service.remove(admin, 'p1')).resolves.toEqual({
      id: 'p1',
      outcome: 'deleted',
    });
    expect(prisma.promoCode.delete).toHaveBeenCalledWith({
      where: { id: 'p1' },
    });
    expect(prisma.promoCode.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.promo_code.delete' }),
    );
  });

  it('archives a used code so payment history stays', async () => {
    const { service, prisma, provider, audit } = setup(
      promo({ redeemed_count: 3, stripe_coupon_id: 'cp_1' }),
    );
    await expect(service.remove(admin, 'p1')).resolves.toEqual({
      id: 'p1',
      outcome: 'archived',
    });
    expect(prisma.promoCode.delete).not.toHaveBeenCalled();
    const data = prisma.promoCode.update.mock.calls[0][0].data;
    expect(data.active).toBe(false);
    expect(data.archived_at).toBeInstanceOf(Date);
    expect(data.stripe_coupon_id).toBeNull();
    expect(provider.deleteCoupon).toHaveBeenCalledWith('cp_1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.promo_code.archive' }),
    );
  });

  it('archives a code a case promotion still points at', async () => {
    const { service, prisma } = setup(promo(), { promotions: 1 });
    await expect(service.remove(admin, 'p1')).resolves.toMatchObject({
      outcome: 'archived',
    });
    expect(prisma.promoCode.delete).not.toHaveBeenCalled();
  });

  it('restores an archived code switched off', async () => {
    const { service } = setup(
      promo({ archived_at: new Date(), active: false, redeemed_count: 1 }),
    );
    const r = await service.restore(admin, 'p1');
    expect(r.archivedAt).toBeNull();
    expect(r.active).toBe(false);
    expect(r.status).toBe('inactive');
  });

  it('an archived code cannot simply be switched back on', async () => {
    const { service } = setup(
      promo({ archived_at: new Date(), active: false }),
    );
    await expect(
      service.update(admin, 'p1', { active: true }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('promoStatus', () => {
  it('archived wins over every other state', () => {
    expect(promoStatus(promo({ archived_at: new Date() }))).toBe('archived');
    expect(promoStatus(promo({ active: false }))).toBe('inactive');
  });
});
