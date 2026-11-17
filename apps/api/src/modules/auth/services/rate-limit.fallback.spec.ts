import { RateLimitService } from './rate-limit.service';
import { UsageLimitsService } from '../../../common/usage-limits/usage-limits.service';

/**
 * Audit 17.11 (problem 2): with Valkey down, `limits.consume('message')`
 * threw and no 1:1 or group message could be sent. The limits now count in
 * the process while Valkey is unreachable — still limited, never an error.
 */
const down = {
  eval: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
};

describe('RateLimitService without Valkey', () => {
  it('a fixed window keeps working in the process, with the same limit', async () => {
    const svc = new RateLimitService(down as never);
    const take = () =>
      svc.consumeFixedWindow(['usage', 'message', 'u1'], 2, 60);
    expect((await take()).allowed).toBe(true);
    expect((await take()).allowed).toBe(true);
    const third = await take();
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    // Another person has a budget of their own.
    expect(
      (await svc.consumeFixedWindow(['usage', 'message', 'u2'], 2, 60)).allowed,
    ).toBe(true);
  });

  it('a sliding window (SMS) stays limited too', async () => {
    const svc = new RateLimitService(down as never);
    const take = () => svc.consumeSlidingWindow(['otp', 'x'], 1, 3600);
    expect((await take()).allowed).toBe(true);
    expect((await take()).allowed).toBe(false);
  });

  it('sending a message does not fail', async () => {
    const limits = new UsageLimitsService(new RateLimitService(down as never), {
      number: jest.fn().mockResolvedValue(30),
    } as never);
    await expect(limits.consume('message', 'u1')).resolves.toBeUndefined();
  });
});
