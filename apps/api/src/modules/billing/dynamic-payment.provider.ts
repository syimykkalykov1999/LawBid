import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { SecretsService } from '../../common/secrets/secrets.service';
import type { PaymentProvider } from './payment-provider';
import { StripePaymentProvider } from './stripe-payment.provider';

/**
 * Owner 2026-10-01: the Stripe keys can be changed in the admin
 * (Integrations) without a restart. Every async call first refreshes the
 * underlying provider (rebuilt only when the key fingerprint changed);
 * the few sync members (name, webhook check, dashboard link) use the last
 * one — the webhook intake refreshes before checking a signature. Without
 * keys: the fake provider in dev/test, a clear 503 when deployed.
 */
export class DynamicPaymentProvider {
  private current: PaymentProvider;
  private fingerprint = '';

  constructor(
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
    private readonly fallback: PaymentProvider,
  ) {
    this.current = fallback;
  }

  async refresh(): Promise<PaymentProvider> {
    const c = await this.secrets.get('stripe');
    const key = c?.fields.secretKey;
    if (key) {
      if (c.fingerprint !== this.fingerprint) {
        this.current = new StripePaymentProvider(key, c.fields.webhookSecret);
        this.fingerprint = c.fingerprint;
      }
      return this.current;
    }
    const env = this.config.get<string>('NODE_ENV');
    if (env === 'production' || env === 'staging') {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    this.current = this.fallback;
    this.fingerprint = '';
    return this.current;
  }

  /** A PaymentProvider whose every call goes to the current keys. */
  asProvider(): PaymentProvider {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Proxy({} as PaymentProvider, {
      get(_target, prop: string | symbol): unknown {
        if (prop === 'refresh') return () => self.refresh();
        // Not a promise (Nest probes `then` on providers).
        if (prop === 'then' || typeof prop !== 'string') return undefined;
        const current = self.current as unknown as Record<string, unknown>;
        if (ASYNC_METHODS.has(prop)) {
          return async (...args: unknown[]): Promise<unknown> => {
            const p = (await self.refresh()) as unknown as Record<
              string,
              (...a: unknown[]) => Promise<unknown>
            >;
            return p[prop](...args);
          };
        }
        // name, constructWebhookEvent, dashboardUrl, test helpers.
        const v = current[prop];
        return typeof v === 'function'
          ? (v as (...a: unknown[]) => unknown).bind(self.current)
          : v;
      },
    });
  }
}

/** The PaymentProvider calls that reach the provider over the network. */
const ASYNC_METHODS = new Set([
  'createCustomer',
  'createSetupIntent',
  'retrieveSetupIntent',
  'paymentMethodFingerprint',
  'createSubscription',
  'retrieveSubscription',
  'setCancelAtPeriodEnd',
  'cancelNow',
  'extendUntil',
  'endTrialNow',
  'createPortalSession',
  'createCheckoutSession',
  'retrieveCheckoutSession',
  'setSeatQuantity',
  'switchToYearly',
  'retrieveInvoice',
  'retrieveCharge',
]);

/** Refreshes a dynamic provider (no-op for a plain one). */
export async function refreshProvider(p: PaymentProvider): Promise<void> {
  const r = (p as unknown as { refresh?: () => Promise<unknown> }).refresh;
  if (typeof r === 'function') await r();
}
