/* eslint-disable @typescript-eslint/unbound-method -- jest.fn() members are
   only asserted on (toHaveBeenCalled...), never invoked unbound. */
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, Observable, throwError, defer } from 'rxjs';
import { FakeRedis } from '../../test/support/fake-redis';
import { UseInterceptors } from '@nestjs/common';
import {
  GlobalIdempotencyInterceptor,
  IDEMPOTENCY_PENDING_TTL_SECONDS,
  IDEMPOTENCY_TTL_SECONDS,
  IdempotencyInterceptor,
} from './idempotency.interceptor';

/** FakeRedis + a JS stand-in for the Redis EVAL release script (FakeRedis
 * can't run Lua; this is Redis server-side scripting, not JS eval). */
class TestRedis extends FakeRedis {
  readonly sets: unknown[][] = [];
  override set(key: string, value: string, ...args: unknown[]) {
    this.sets.push([key, value, ...args]);
    return super.set(key, value, ...args);
  }
  async eval(_script: string, _n: number, key: string, token: string) {
    const raw = await this.get(key);
    if (!raw) return 0;
    const rec = JSON.parse(raw) as { state: string; token?: string };
    if (rec.state === 'pending' && rec.token === token) return this.del(key);
    return 0;
  }
}

function context(
  key: string | undefined,
  body: unknown,
  res = { statusCode: 201, status: jest.fn(), setHeader: jest.fn() },
  opts: { userId?: string; handler?: object; url?: string } = {},
) {
  const req = {
    userId: opts.userId,
    method: 'POST',
    originalUrl: opts.url ?? '/api/v1/things',
    body,
    header: (name: string) =>
      name.toLowerCase() === 'idempotency-key' ? key : undefined,
  };
  const ctx = {
    getType: () => 'http',
    getHandler: () => opts.handler ?? function plain() {},
    getClass: () => class Plain {},
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, res };
}

function handler(result: () => Observable<unknown>) {
  const handle = jest.fn(result);
  return { handle } as unknown as CallHandler<unknown> & { handle: jest.Mock };
}

describe('IdempotencyInterceptor', () => {
  it('verify 17.11: global + route copy on one request claims the key once', async () => {
    const redis = new TestRedis();
    const outer = new IdempotencyInterceptor(redis as never);
    const inner = new IdempotencyInterceptor(redis as never);
    let runs = 0;
    const route = handler(() => defer(() => Promise.resolve({ n: ++runs })));
    const { ctx } = context('k-nested', { a: 1 });
    // The route's own copy runs inside the global one.
    const chain = {
      handle: () => inner.intercept(ctx, route),
    } as unknown as CallHandler<unknown>;
    await expect(lastValueFrom(outer.intercept(ctx, chain))).resolves.toEqual({
      n: 1,
    });
    // A retry with the same key (a new request object) replays.
    const again = context('k-nested', { a: 1 });
    const chain2 = {
      handle: () => inner.intercept(again.ctx, route),
    } as unknown as CallHandler<unknown>;
    await expect(
      lastValueFrom(outer.intercept(again.ctx, chain2)),
    ).resolves.toEqual({ n: 1 });
    expect(runs).toBe(1);
  });

  it('passes straight through without a key', async () => {
    const redis = new TestRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    const next = handler(() => defer(() => Promise.resolve({ ok: 1 })));
    const { ctx } = context(undefined, {});
    await expect(
      lastValueFrom(interceptor.intercept(ctx, next)),
    ).resolves.toEqual({ ok: 1 });
    expect(redis.sets).toHaveLength(0);
  });

  it('claims with SET NX + pending TTL, then stores the result for 24h and replays it', async () => {
    const redis = new TestRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    const next = handler(() => defer(() => Promise.resolve({ id: 'first' })));

    const first = await lastValueFrom(
      interceptor.intercept(context('k1', { a: 1 }).ctx, next),
    );
    expect(first).toEqual({ id: 'first' });
    expect(redis.sets[0]).toEqual([
      expect.stringContaining(':k1'),
      expect.stringContaining('"pending"'),
      'EX',
      IDEMPOTENCY_PENDING_TTL_SECONDS,
      'NX',
    ]);
    expect(redis.sets[1]).toEqual([
      expect.stringContaining(':k1'),
      expect.stringContaining('"done"'),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
    ]);

    const { ctx, res } = context('k1', { a: 1 });
    const replay = await lastValueFrom(interceptor.intercept(ctx, next));
    expect(replay).toEqual({ id: 'first' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('a concurrent duplicate while the first is in flight gets 409 in_progress and never runs the handler', async () => {
    const redis = new TestRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    let finish: (v: unknown) => void = () => undefined;
    const slow = handler(
      () =>
        new Observable((sub) => {
          finish = (v) => {
            sub.next(v);
            sub.complete();
          };
        }),
    );

    const firstP = lastValueFrom(
      interceptor.intercept(context('k2', { a: 1 }).ctx, slow),
    );
    await new Promise((r) => setImmediate(r)); // let the claim land
    const dup = context('k2', { a: 1 });
    await expect(
      lastValueFrom(interceptor.intercept(dup.ctx, slow)),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        details: { reason: 'in_progress' },
      }),
    });
    expect(dup.res.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    finish({ id: 'only' });
    await expect(firstP).resolves.toEqual({ id: 'only' });
    expect(slow.handle).toHaveBeenCalledTimes(1);
  });

  it('the same key with a different payload is a 409 payload_mismatch, never a replay', async () => {
    const redis = new TestRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    const next = handler(() => defer(() => Promise.resolve({ secret: 'A' })));
    await lastValueFrom(
      interceptor.intercept(context('k3', { a: 1 }).ctx, next),
    );
    await expect(
      lastValueFrom(interceptor.intercept(context('k3', { a: 2 }).ctx, next)),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        details: { reason: 'payload_mismatch' },
      }),
    });
  });

  it('releases the claim when the handler fails, so the key can be retried', async () => {
    const redis = new TestRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    const failing = handler(() => throwError(() => new Error('boom')));
    await expect(
      lastValueFrom(
        interceptor.intercept(context('k4', { a: 1 }).ctx, failing),
      ),
    ).rejects.toThrow('boom');
    await expect(redis.get(redis.sets[0][0] as string)).resolves.toBeNull();

    const ok = handler(() => defer(() => Promise.resolve({ retried: true })));
    await expect(
      lastValueFrom(interceptor.intercept(context('k4', { a: 1 }).ctx, ok)),
    ).resolves.toEqual({ retried: true });
    expect(ok.handle).toHaveBeenCalledTimes(1);
  });

  it('a failed result write does not turn a successful side effect into an error', async () => {
    const redis = new TestRedis();
    const interceptor = new IdempotencyInterceptor(redis as never);
    const realSet = redis.set.bind(redis);
    let calls = 0;
    jest.spyOn(redis, 'set').mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error('redis blip'));
      return realSet(...args);
    });
    const next = handler(() => defer(() => Promise.resolve({ sent: true })));
    await expect(
      lastValueFrom(interceptor.intercept(context('k5', {}).ctx, next)),
    ).resolves.toEqual({ sent: true });
  });

  describe('the global copy (verify 17.11)', () => {
    const res = () => ({
      statusCode: 201,
      status: jest.fn(),
      setHeader: jest.fn(),
    });
    const counting = () => {
      let n = 0;
      return handler(() => defer(() => Promise.resolve({ n: ++n })));
    };

    it('an anonymous request (a webhook) passes untouched, even with a key', async () => {
      const g = new GlobalIdempotencyInterceptor(new TestRedis() as never);
      const next = counting();
      for (let i = 0; i < 2; i += 1) {
        await lastValueFrom(g.intercept(context('wh-1', { e: 1 }).ctx, next));
      }
      expect(next.handle).toHaveBeenCalledTimes(2);
    });

    it("two people with the same key never get each other's answer", async () => {
      const g = new GlobalIdempotencyInterceptor(new TestRedis() as never);
      const next = counting();
      const a = await lastValueFrom(
        g.intercept(
          context('same', { x: 1 }, res(), { userId: 'u-a' }).ctx,
          next,
        ),
      );
      const b = await lastValueFrom(
        g.intercept(
          context('same', { x: 1 }, res(), { userId: 'u-b' }).ctx,
          next,
        ),
      );
      const aAgain = await lastValueFrom(
        g.intercept(
          context('same', { x: 1 }, res(), { userId: 'u-a' }).ctx,
          next,
        ),
      );
      expect([a, b, aAgain]).toEqual([{ n: 1 }, { n: 2 }, { n: 1 }]);
      expect(next.handle).toHaveBeenCalledTimes(2);
    });

    it('a signed-in retry replays; a new body under the key runs as new', async () => {
      const g = new GlobalIdempotencyInterceptor(new TestRedis() as never);
      const next = counting();
      const run = (body: unknown) =>
        lastValueFrom(
          g.intercept(
            context('job-1', body, res(), { userId: 'u-a' }).ctx,
            next,
          ),
        );
      expect(await run({ files: ['f1'] })).toEqual({ n: 1 });
      expect(await run({ files: ['f1'] })).toEqual({ n: 1 });
      expect(await run({ files: ['f2'] })).toEqual({ n: 2 });
    });

    it('steps aside for a route that names the interceptor (it stays strict)', async () => {
      const redis = new TestRedis();
      const g = new GlobalIdempotencyInterceptor(redis as never);
      class Ctl {
        @UseInterceptors(IdempotencyInterceptor)
        create() {}
      }
      const routeHandler = Object.getOwnPropertyDescriptor(
        Ctl.prototype,
        'create',
      )!.value as object;
      const next = counting();
      await lastValueFrom(
        g.intercept(
          context('k-route', { a: 1 }, res(), {
            userId: 'u-a',
            handler: routeHandler,
          }).ctx,
          next,
        ),
      );
      expect(next.handle).toHaveBeenCalledTimes(1);
      expect(redis.sets).toHaveLength(0);
    });
  });
});
