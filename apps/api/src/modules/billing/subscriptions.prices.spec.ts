import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import type { PaymentProvider } from './payment-provider';
import type { SubscriptionSyncService } from './subscription-sync.service';
import { SubscriptionsService } from './subscriptions.service';

type PriceAccess = {
  requirePrice(kind: 'seat' | 'yearly'): Promise<string>;
  assertConfigured(): Promise<string>;
};

function make(name: string, env: Record<string, string>): PriceAccess {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const provider = { name } as unknown as PaymentProvider;
  return new SubscriptionsService(
    {} as PrismaService,
    provider,
    {} as SubscriptionAccessService,
    {} as SubscriptionSyncService,
    config,
  ) as unknown as PriceAccess;
}

describe('SubscriptionsService price ids', () => {
  it('uses fake ids on the fake provider', async () => {
    const s = make('fake', {});
    await expect(s.requirePrice('seat')).resolves.toBe('price_fake_seat_100');
    await expect(s.requirePrice('yearly')).resolves.toBe(
      'price_fake_yearly_9590',
    );
  });

  it('never falls back to fake ids with live Stripe', async () => {
    const s = make('stripe', { STRIPE_PRICE_ID: 'price_month' });
    await expect(s.assertConfigured()).resolves.toBe('price_month');
    await expect(s.requirePrice('seat')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(s.requirePrice('yearly')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('uses configured seat and yearly ids', async () => {
    const s = make('stripe', {
      STRIPE_PRICE_SEAT_ID: 'price_seat',
      STRIPE_PRICE_YEARLY_ID: 'price_year',
    });
    await expect(s.requirePrice('seat')).resolves.toBe('price_seat');
    await expect(s.requirePrice('yearly')).resolves.toBe('price_year');
  });
});
