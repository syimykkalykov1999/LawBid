import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { PaymentProvider } from '../billing/payment-provider';
import type { PricingService } from '../billing/pricing.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClientPlansService } from './client-plans.service';
import type { EntitlementsService } from './entitlements.service';
import type { PlansService } from './plans.service';

function make(customer: { stripe_customer_id: string } | null) {
  const prisma = {
    stripeCustomer: { findUnique: jest.fn().mockResolvedValue(customer) },
  } as unknown as PrismaService;
  const provider = {
    createPortalSession: jest
      .fn()
      .mockResolvedValue('https://billing.stripe.com/p/session/x'),
  };
  const config = {
    get: (k: string) =>
      k === 'APP_LINK_BASE_URL' ? 'https://lawbid.dev/' : undefined,
  } as unknown as ConfigService;
  const svc = new ClientPlansService(
    prisma,
    {} as PlansService,
    {} as EntitlementsService,
    {} as PricingService,
    config,
    provider as unknown as PaymentProvider,
  );
  return { svc, provider };
}

const client = { sub: 'u1', role: 'client' } as RequestUser;

describe('ClientPlansService.portalSession (owner 2026-10-06)', () => {
  it("opens the portal of the client's own Stripe customer", async () => {
    const { svc, provider } = make({ stripe_customer_id: 'cus_1' });
    await expect(svc.portalSession(client)).resolves.toEqual({
      url: 'https://billing.stripe.com/p/session/x',
    });
    expect(provider.createPortalSession).toHaveBeenCalledWith(
      'cus_1',
      'https://lawbid.dev/plan',
    );
  });

  it('404 when the client never paid (no customer is created)', async () => {
    const { svc, provider } = make(null);
    await expect(svc.portalSession(client)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(provider.createPortalSession).not.toHaveBeenCalled();
  });

  it('clients only', async () => {
    const { svc } = make({ stripe_customer_id: 'cus_1' });
    await expect(
      svc.portalSession({ sub: 'u2', role: 'attorney' } as RequestUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
