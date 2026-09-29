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
            ]
          : [],
      providers: [
        { provide: BILLING_OPTIONS, useValue: options },
        {
          provide: PAYMENT_PROVIDER,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const key = config.get<string>('STRIPE_SECRET_KEY');
            return key
              ? new StripePaymentProvider(
                  key,
                  config.get<string>('STRIPE_WEBHOOK_SECRET'),
                )
              : new FakePaymentProvider();
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
