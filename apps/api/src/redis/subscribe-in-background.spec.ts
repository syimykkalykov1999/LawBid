import { subscribeInBackground } from './subscribe-in-background';

type Handler = (channel: string, message: string) => void;
function fakeSub(subscribe: () => Promise<unknown>) {
  const handlers: Handler[] = [];
  return {
    handlers,
    sub: {
      on: jest.fn((event: string, fn: Handler) => {
        if (event === 'message') handlers.push(fn);
      }),
      subscribe: jest.fn(subscribe),
    },
  };
}

describe('subscribeInBackground (boot never waits for Redis)', () => {
  it('returns at once even when SUBSCRIBE never settles, with the handler wired', () => {
    const { sub, handlers } = fakeSub(() => new Promise(() => undefined));
    const seen: string[] = [];
    subscribeInBackground(
      sub as never,
      'ch',
      (c, m) => seen.push(`${c}:${m}`),
      () => undefined,
    );
    expect(sub.subscribe).toHaveBeenCalledWith('ch');
    handlers[0]('ch', 'hello');
    expect(seen).toEqual(['ch:hello']);
  });

  it('a failed SUBSCRIBE is logged, not thrown', async () => {
    const { sub } = fakeSub(() => Promise.reject(new Error('NOPERM')));
    const warns: string[] = [];
    subscribeInBackground(
      sub as never,
      'ch',
      () => undefined,
      (m) => warns.push(m),
    );
    await new Promise((r) => setImmediate(r));
    expect(warns).toEqual(['subscribe ch failed: Error: NOPERM']);
  });
});
