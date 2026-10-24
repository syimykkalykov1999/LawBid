import { CircuitBreaker, CircuitOpenError } from './resilience';
import { breakerHttpClient, resilientStripeOptions } from './stripe-breaker';

function res(status: number) {
  return { getStatusCode: () => status } as never;
}
const args = [
  'api.stripe.com',
  443,
  '/v1/x',
  'GET',
  {},
  '',
  'https',
  1000,
] as const;

/** Batch C item 6: Stripe calls are paused after repeated service faults. */
describe('stripe breaker http client', () => {
  it('passes answers through and hands a 5xx back to the SDK', async () => {
    const breaker = new CircuitBreaker('stripe-t1');
    const make = jest.fn().mockResolvedValue(res(502));
    const client = breakerHttpClient({ makeRequest: make }, breaker);
    const out = await client.makeRequest(...args);
    expect(out.getStatusCode()).toBe(502);
  });

  it('opens after five 5xx / network faults and refuses without calling', async () => {
    const breaker = new CircuitBreaker('stripe-t2', { threshold: 5 });
    const make = jest
      .fn()
      .mockResolvedValueOnce(res(500))
      .mockRejectedValue(new Error('ECONNRESET'));
    const client = breakerHttpClient({ makeRequest: make }, breaker);
    await client.makeRequest(...args);
    for (let i = 0; i < 4; i += 1) {
      await expect(client.makeRequest(...args)).rejects.toThrow('ECONNRESET');
    }
    expect(breaker.isOpen).toBe(true);
    await expect(client.makeRequest(...args)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(make).toHaveBeenCalledTimes(5);
  });

  it('4xx answers (declined card, bad request) never count', async () => {
    const breaker = new CircuitBreaker('stripe-t3');
    const make = jest.fn().mockResolvedValue(res(402));
    const client = breakerHttpClient({ makeRequest: make }, breaker);
    for (let i = 0; i < 10; i += 1) await client.makeRequest(...args);
    expect(breaker.isOpen).toBe(false);
  });

  it('shared options carry a timeout, retries and the breaker client', () => {
    const o = resilientStripeOptions();
    expect(o.timeout).toBe(20_000);
    expect(o.maxNetworkRetries).toBe(2);
    expect(o.httpClient).toBeDefined();
  });
});
