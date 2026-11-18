/**
 * Verify 17.11 (batch 9): Stripe's own rule for a failed money call — a
 * network error, a timeout or a 5xx leaves the outcome UNKNOWN (the money
 * may have moved); only a definite answer (a 4xx: declined, invalid,
 * refused) means it did not. An unknown one is retried with the SAME
 * idempotency key, never marked failed and redone under a new key
 * (docs.stripe.com/api/idempotent_requests, docs.stripe.com/error-low-level).
 * A same-key request still running (409 idempotency_key_in_use) is unknown
 * too.
 */
export function outcomeUnknown(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { type?: unknown; statusCode?: unknown; code?: unknown };
  if (err.type === 'StripeConnectionError' || err.type === 'StripeAPIError') {
    return true;
  }
  if (err.code === 'idempotency_key_in_use') return true;
  return typeof err.statusCode === 'number' && err.statusCode >= 500;
}
