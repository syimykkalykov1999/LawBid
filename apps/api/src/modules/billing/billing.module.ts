import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { BidsModule } from '../bids/bids.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import {
  BILLING_OPTIONS,
  type BillingModuleOptions,
  PAYMENT_PROVIDER,
} from './billing.constants';
import { BillingRunner } from './billing.runner';
import { FakeCheckoutController } from './fake-checkout.controller';
import { FakePaymentProvider } from './fake-payment.provider';
import { StripePaymentProvider } from './stripe-payment.provider';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookIntakeService } from './stripe-webhook.intake';
import { SubscriptionSyncService } from './subscription-sync.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * docs/06 §1 (stage 6.7): Stripe subscriptions behind PaymentProvider.
 * `register({mode})` — 'api' adds the HTTP surface; both modes run the
 * queue workers (BillingRunner) so the dedicated worker process handles
 * webhooks and reminders too. Without STRIPE_SECRET_KEY the fake provider
 * is used (dev / e2e), driven through the same webhook endpoint.
 */
@Module({})
export class BillingModule {
  static register(options: BillingModuleOptions): DynamicModule {
    return {
      module: BillingModule,
      // Global: PrivacyModule (anonymization) needs PAYMENT_PROVIDER and the
      // sync service; a second `register()` would be a second instance
      // (Nest 11 keys dynamic modules by reference), i.e. a second fake
      // provider store in dev/e2e.
      global: true,
      imports: [
        SubscriptionsModule,
        BidsModule,
        NotificationsModule,
        // Only the controllers need the auth guards and the admin audit log;
        // the worker must stay bootable without AppModule's global modules.
        ...(options.mode === 'api' ? [AdminAccessModule, AuthModule] : []),
      ],
      controllers:
        options.mode === 'api'
          ? [
              SubscriptionsController,
              StripeWebhookController,
              AdminSubscriptionsController,
              // Dev / e2e stand-in for Stripe's hosted page (404 with Stripe).
              FakeCheckoutController,
            ]
          : [],
      providers: [
        { provide: BILLING_OPTIONS, useValue: options },
        {
          provide: PAYMENT_PROVIDER,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const key = config.get<string>('STRIPE_SECRET_KEY');
            const nodeEnv = config.get<string>('NODE_ENV');
            if (!key && (nodeEnv === 'production' || nodeEnv === 'staging')) {
              throw new Error(
                `STRIPE_SECRET_KEY is required in NODE_ENV=: the fake payment provider is dev/test only`,
              );
            }
            return key
              ? new StripePaymentProvider(
                  key,
                  config.get<string>('STRIPE_WEBHOOK_SECRET'),
                )
              : Object.assign(new FakePaymentProvider(), {
                  checkoutBaseUrl: `http://localhost:${config.get<number>('PORT') ?? 3000}/api/v1/subscriptions/fake-checkout`,
                });
          },
        },
        SubscriptionSyncService,
        SubscriptionsService,
        StripeWebhookIntakeService,
        BillingRunner,
      ],
      exports: [
        PAYMENT_PROVIDER,
        SubscriptionsService,
        SubscriptionSyncService,
        BillingRunner,
      ],
    };
  }
}
