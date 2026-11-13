import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { HttpValidationPipe, hasNulChar } from '../app.setup';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { AppVersionGuard } from '../modules/feature-flags/guards/app-version.guard';
import { ImageFormatInterceptor } from '../modules/files/processing/image-format-context';
import { UserThrottlerGuard } from '../throttler/user-throttler.guard';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { ViewerContextInterceptor } from './viewer/viewer-context';

/**
 * NestJS 12 runs global guards, interceptors and pipes on WebSocket
 * handlers too (docs.nestjs.com/websockets/guards, /pipes); 11 ran them on
 * HTTP routes only. The global ones of this app must leave a gateway
 * message exactly as 11 did: no auth/version/throttle check (the gateways
 * authenticate the socket themselves), no `{ data }` envelope, the raw
 * socket and payload.
 */
const wsContext = (): ExecutionContext =>
  ({
    getType: () => 'ws',
    switchToHttp: () => {
      throw new Error('switchToHttp must not be called for a ws message');
    },
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as unknown as ExecutionContext;

const handler = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('global enhancers on WebSocket messages (Nest 12)', () => {
  it('guards let a ws message through without reading the HTTP request', async () => {
    const never = new Proxy(
      {},
      {
        get: () => {
          throw new Error('dependency must not be used');
        },
      },
    );
    const guards = [
      new JwtAuthGuard(
        never as never,
        never as never,
        never as never,
        never as never,
      ),
      new AppVersionGuard(never as never, never as never),
      Object.create(UserThrottlerGuard.prototype) as UserThrottlerGuard,
    ];
    for (const guard of guards) {
      await expect(guard.canActivate(wsContext())).resolves.toBe(true);
    }
  });

  it('interceptors pass the gateway result through unchanged', async () => {
    const ack = { ok: true };
    const interceptors = [
      new ResponseInterceptor(),
      new ViewerContextInterceptor(),
      new ImageFormatInterceptor(),
    ];
    for (const interceptor of interceptors) {
      const out = await lastValueFrom(
        interceptor.intercept(wsContext(), handler(ack)) as never,
      );
      expect(out).toBe(ack);
    }
  });

  it('the validation pipe leaves ws parameters (numeric type) as they are', async () => {
    class Socketish {
      emit() {}
    }
    const socket = new Socketish();
    const pipe = new HttpValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(socket, { type: 0 as never, metatype: Socketish }),
    ).resolves.toBe(socket);
  });

  it('row 80: a NUL character in a query or body is a 400, not a database 500', async () => {
    const pipe = new HttpValidationPipe({ transform: true });
    await expect(
      pipe.transform('\u0000x', { type: 'query', metatype: String, data: 'q' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { q: 'ok', nested: { list: ['a', 'b\u0000'] } },
        { type: 'body', metatype: Object },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform('plain', { type: 'query', metatype: String, data: 'q' }),
    ).resolves.toBe('plain');
    expect(hasNulChar(Buffer.from([0, 1, 2]))).toBe(false);
    expect(hasNulChar({ ['k\u0000']: 1 })).toBe(true);
  });

  it('the validation pipe still validates HTTP bodies', async () => {
    const pipe = new HttpValidationPipe({ transform: true });
    await expect(
      pipe.transform('7', { type: 'query', metatype: Number, data: 'n' }),
    ).resolves.toBe(7);
  });
});
