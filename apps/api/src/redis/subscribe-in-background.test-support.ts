import type Redis from 'ioredis';
import type { Subscriber } from './subscribe-in-background';

type Handler = (channel: string, message: string) => void;

/** A stand-in for a pub/sub ioredis client: `subscribe` answers as told. */
export function fakeSubscriber(
  subscribe: () => Promise<unknown> = () => new Promise(() => undefined),
) {
  const handlers: Handler[] = [];
  const readyOnce: (() => void)[] = [];
  const sub = {
    status: 'connecting',
    on: jest.fn((event: string, fn: Handler) => {
      if (event === 'message') handlers.push(fn);
    }),
    once: jest.fn((event: string, fn: () => void) => {
      if (event === 'ready') readyOnce.push(fn);
    }),
    subscribe: jest.fn(subscribe),
    quit: jest.fn(() => Promise.resolve('OK')),
    disconnect: jest.fn(),
  } satisfies Subscriber & Record<string, unknown>;
  return { sub, handlers, readyOnce };
}

/** A main client whose duplicate() hands out [sub]. */
export function redisWithSubscriber(sub: unknown): Redis {
  return { duplicate: jest.fn(() => sub) } as unknown as Redis;
}

/** A main client whose duplicate() throws (a broken double). */
export function brokenRedis(): Redis {
  return {
    duplicate: jest.fn(() => {
      throw new Error('no duplicate');
    }),
  } as unknown as Redis;
}
