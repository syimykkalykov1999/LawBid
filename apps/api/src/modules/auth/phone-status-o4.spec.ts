import { APP_CHECK_KEY } from './app-check/app-check.guard';
import { AuthController } from './auth.controller';
import { waitUntil } from './uniform-response.util';

/**
 * STAGE2_SECURITY O4 (ASVS 5.0 V6.3.8), decided 25.11: «is this number
 * registered?» gets the bot check of the password sign-in (App Check of its
 * group plus the challenge after repeated failures) and answers after the
 * same minimum time whether the number is registered or not.
 */
describe('POST /auth/phone/status (O4)', () => {
  it('carries the password sign-in challenge, always on, in its own group', () => {
    const options = Reflect.getMetadata(
      APP_CHECK_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- only its metadata is read
      AuthController.prototype.phoneStatus,
    ) as Record<string, unknown>;
    expect(options).toMatchObject({
      group: 'sms',
      challenge: 'password',
      always: true,
    });
  });

  it('waitUntil holds the answer until the floor, and not past it', async () => {
    jest.useFakeTimers();
    try {
      let done = false;
      const p = waitUntil(Date.now() + 150).then(() => (done = true));
      await jest.advanceTimersByTimeAsync(140);
      expect(done).toBe(false);
      await jest.advanceTimersByTimeAsync(20);
      await p;
      expect(done).toBe(true);
      // A deadline in the past resolves at once.
      await expect(waitUntil(Date.now() - 1)).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
