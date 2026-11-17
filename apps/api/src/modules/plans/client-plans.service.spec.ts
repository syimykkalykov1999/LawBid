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

// Owner 16.11: a client pays for a plan with the gold check and gets it at
// once — no documents — while «Проверка документов клиента» is off; the
// plan's features come from the plan builder (entitlements frozen on the
// row) and end with the plan.
describe('ClientPlansService: plan badge without documents (owner 16.11)', () => {
  function plan(documents: boolean, badgeRow: Record<string, unknown> | null) {
    const sub = {
      id: 's1',
      user_id: 'u1',
      status: 'incomplete',
      trial_ends_at: null,
      current_period_end: null,
      canceled_at: null,
    };
    let badge = badgeRow;
    const prisma = {
      clientSubscription: {
        findUnique: jest.fn().mockResolvedValue(sub),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...sub, ...data }),
        ),
      },
      clientVerification: {
        findUnique: jest.fn(() => Promise.resolve(badge)),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          badge = { ...badge, ...data };
          return Promise.resolve(badge);
        }),
        upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
          badge = { ...create };
          return Promise.resolve(badge);
        }),
      },
    } as unknown as PrismaService;
    const entitlements = {
      invalidateUser: jest.fn().mockResolvedValue(undefined),
      forUser: jest.fn().mockResolvedValue({
        values: { verified_badge: true, video_posts: true },
      }),
    } as unknown as EntitlementsService;
    const settings = {
      boolean: jest.fn((k: string) =>
        Promise.resolve(
          k === 'verification.client_badge_documents' ? documents : false,
        ),
      ),
    };
    const svc = new ClientPlansService(
      prisma,
      {} as PlansService,
      entitlements,
      {} as PricingService,
      { get: () => undefined } as unknown as ConfigService,
      {} as PaymentProvider,
      { emit: jest.fn().mockResolvedValue(undefined) } as never,
      undefined,
      settings as never,
    );
    const active = {
      id: 'sub_1',
      customerId: 'cus',
      status: 'active',
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancelAtPeriodEnd: false,
      trialEnd: null,
      canceledAt: null,
    };
    return { svc, active, badge: () => badge };
  }

  it('documents off: the paid plan approves the badge with no documents', async () => {
    const { svc, active, badge } = plan(false, null);
    await svc.applySubscription(active as never);
    expect(badge()).toMatchObject({
      user_id: 'u1',
      status: 'approved',
      document_file_ids: [],
    });
  });

  it('documents on: the plan waits for the documents (no row is made)', async () => {
    const { svc, active, badge } = plan(true, null);
    await svc.applySubscription(active as never);
    expect(badge()).toBeNull();
  });

  it('documents off: a badge the admin revoked stays revoked', async () => {
    const { svc, active, badge } = plan(false, {
      id: 'v1',
      user_id: 'u1',
      status: 'revoked',
    });
    await svc.applySubscription(active as never);
    expect(badge()).toMatchObject({ status: 'revoked' });
  });
});
