import Stripe from 'stripe';
import { CircuitBreaker } from './resilience';

/**
 * Batch C item 6 (2026-10-24): one circuit breaker for every Stripe client
 * (billing, payroll, treasury). It sits in the SDK's HTTP layer, so every
 * call is covered without touching call sites, and a call refused by an
 * open circuit never leaves the process: writes can be refused safely, and
 * the SDK's own idempotency keys stay as they are. Webhook signature checks
 * do not use HTTP and are unaffected.
 *
 * Counted as «Stripe is down»: connection errors, timeouts, HTTP 5xx.
 * Not counted: 4xx (a bad request, a declined card) and 429.
 */
export const stripeBreaker = new CircuitBreaker('stripe', {
  threshold: 5,
  openMs: 60_000,
});

/** Request timeout for every Stripe client, ms. */
export const STRIPE_TIMEOUT_MS = 20_000;

type HttpClientI = NonNullable<Stripe.StripeConfig['httpClient']>;
type Res = Awaited<ReturnType<HttpClientI['makeRequest']>>;

class FiveHundred extends Error {
  constructor(readonly response: Res) {
    super(`Stripe HTTP ${response.getStatusCode()}`);
  }
}

type Base = Pick<HttpClientI, 'makeRequest'> & {
  getClientName?: () => string;
};

/** Wraps [base] (the SDK's own Node client by default). */
export function breakerHttpClient(
  base: Base = Stripe.createNodeHttpClient(),
  breaker: CircuitBreaker = stripeBreaker,
): HttpClientI {
  return {
    getClientName: () => base.getClientName?.() ?? 'breaker',
    makeRequest: async (...args: Parameters<HttpClientI['makeRequest']>) => {
      try {
        return await breaker.run(async () => {
          const res = await base.makeRequest(...args);
          if (res.getStatusCode() >= 500) throw new FiveHundred(res);
          return res;
        });
      } catch (e) {
        // Hand the 5xx back to the SDK so it maps and retries as usual.
        if (e instanceof FiveHundred) return e.response;
        throw e;
      }
    },
  };
}

/** Options every Stripe client in the API shares. */
export function resilientStripeOptions(): Stripe.StripeConfig {
  return {
    typescript: true,
    maxNetworkRetries: 2,
    timeout: STRIPE_TIMEOUT_MS,
    httpClient: breakerHttpClient(),
  };
}
