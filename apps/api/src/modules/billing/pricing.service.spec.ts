import type { ConfigService } from '@nestjs/config';
import type { PlanPrice } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { FakePaymentProvider } from './fake-payment.provider';
import { PricingService } from './pricing.service';

function row(p: Partial<PlanPrice>): PlanPrice {
  return {
    id: p.id ?? 'r1',
    kind: p.kind ?? 'monthly',
    amount_cents: p.amount_cents ?? 19_900,
    currency: 'usd',
    active: p.active ?? true,
    stripe_price_ids: p.stripe_price_ids ?? {},
    stripe_product_ids: p.stripe_product_ids ?? {},
    note: null,
    created_by: null,
    created_at: p.created_at ?? new Date(),
  };
}

function make(rows: PlanPrice[], env: Record<string, string> = {}) {
  const prisma = {
    planPrice: {
      findMany: ({ where }: { where: Partial<PlanPrice> }) =>
        Promise.resolve(
          rows.filter(
            (r) =>
              (where.active === undefined || r.active === where.active) &&
              (where.kind === undefined || r.kind === where.kind),
          ),
        ),
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<PlanPrice>;
      }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return Promise.resolve(r);
      },
    },
  } as unknown as PrismaService;
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const provider = new FakePaymentProvider();
  return {
    pricing: new PricingService(prisma, provider, config),
    provider,
    rows,
  };
}

describe('PricingService', () => {
  it('uses the built-in prices and legacy ids while the admin set none', async () => {
    const { pricing } = make([]);
    await expect(pricing.amounts()).resolves.toEqual({
      monthly: 39_900,
      seat: 10_000,
      yearly: 959_000,
      client_badge: 1000,
    });
    await expect(pricing.priceId('monthly')).resolves.toBe('price_fake_399');
  });

  it('uses the admin price and creates its Stripe price once', async () => {
    const { pricing, provider, rows } = make([row({ amount_cents: 19_900 })]);
    expect((await pricing.amounts()).monthly).toBe(19_900);
    const id = await pricing.priceId('monthly');
    expect(id).toMatch(/^price_fake_monthly_19900_/);
    expect(provider.prices.get(id!)?.amountCents).toBe(19_900);
    expect(rows[0].stripe_price_ids).toEqual({ fake: id });
    pricing.invalidate();
    await expect(pricing.priceId('monthly')).resolves.toBe(id);
    expect(provider.prices.size).toBe(1);
  });

  it('knows old price ids so current subscribers can be matched', async () => {
    const { pricing } = make([
      row({
        id: 'old',
        active: false,
        stripe_price_ids: { fake: 'price_old' },
      }),
      row({ id: 'new', stripe_price_ids: { fake: 'price_new' } }),
    ]);
    const ids = await pricing.knownPriceIds('monthly');
    expect(ids).toEqual(
      expect.arrayContaining(['price_old', 'price_new', 'price_fake_399']),
    );
  });
});
