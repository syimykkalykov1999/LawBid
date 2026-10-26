import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Review R-64: a Redis outage or a lost rotation race must reach the app as a
 * retryable 503 (it keeps the token on 5xx), never as a 401 sign-out. */
describe('AuthService.refresh: busy outcome', () => {
  it('answers 503 SERVER_BUSY with retryAfterSeconds, not 401', async () => {
    const service = Object.create(AuthService.prototype) as AuthService;
    Object.assign(service, {
      sessions: {
        rotate: jest
          .fn()
          .mockResolvedValue({ status: 'busy', retryAfterSeconds: 2 }),
      },
    });
    let caught: unknown;
    try {
      await service.refresh({ refreshToken: 'raw' }, {});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpException);
    const err = caught as HttpException;
    expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(err.getResponse()).toMatchObject({
      code: 'SERVER_BUSY',
      details: { retryAfterSeconds: 2 },
    });
  });
});
