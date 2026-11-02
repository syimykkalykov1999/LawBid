import {
  closeSubscriber,
  subscribeInBackground,
} from './subscribe-in-background';

type Handler = (channel: string, message: string) => void;
/** A stand-in for a pub/sub ioredis client: `subscribe` answers as told. */
export function fakeSubscriber(subscribe: () => Promise<unknown>) {
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
  };
  return { sub, handlers, readyOnce };
}
const settle = () => new Promise((r) => setImmediate(r));

describe('subscribeInBackground (boot never waits for Redis)', () => {
  it('wires the handler and sends SUBSCRIBE even when it never settles', () => {
    const { sub, handlers } = fakeSubscriber(
      () => new Promise(() => undefined),
    );
    const seen: string[] = [];
    subscribeInBackground(
      sub,
      'ch',
      (c, m) => seen.push(`${c}:${m}`),
      () => undefined,
    );
    expect(sub.subscribe).toHaveBeenCalledWith('ch');
    handlers[0]('ch', 'hello');
    expect(seen).toEqual(['ch:hello']);
  });

  it('a refused SUBSCRIBE is logged and re-sent on the next ready, until it is accepted', async () => {
    let n = 0;
    const { sub, readyOnce } = fakeSubscriber(() =>
      n++ < 2 ? Promise.reject(new Error('NOAUTH')) : Promise.resolve(1),
    );
    const warns: string[] = [];
    subscribeInBackground(
      sub,
      'ch',
      () => undefined,
      (m) => warns.push(m),
    );
    await settle();
    expect(warns).toEqual([
      'subscribe ch failed, retrying on reconnect: Error: NOAUTH',
    ]);
    expect(readyOnce).toHaveLength(1);
    readyOnce[0](); // reconnected: second attempt, refused again
    await settle();
    expect(readyOnce).toHaveLength(2);
    readyOnce[1](); // third attempt is accepted: no more retries armed
    await settle();
    expect(sub.subscribe).toHaveBeenCalledTimes(3);
    expect(readyOnce).toHaveLength(2);
  });
});

describe('closeSubscriber (shutdown while Redis is away must not hang)', () => {
  it('drops a client that is not ready without sending QUIT', async () => {
    const { sub } = fakeSubscriber(() => new Promise(() => undefined));
    await closeSubscriber(sub);
    expect(sub.disconnect).toHaveBeenCalledTimes(1);
    expect(sub.quit).not.toHaveBeenCalled();
  });

  it('quits a ready client, and falls back to disconnect when QUIT hangs or fails', async () => {
    const ok = fakeSubscriber(() => Promise.resolve(1));
    ok.sub.status = 'ready';
    await closeSubscriber(ok.sub);
    expect(ok.sub.quit).toHaveBeenCalledTimes(1);
    expect(ok.sub.disconnect).not.toHaveBeenCalled();

    const hung = fakeSubscriber(() => Promise.resolve(1));
    hung.sub.status = 'ready';
    hung.sub.quit.mockImplementation(() => new Promise(() => undefined));
    await closeSubscriber(hung.sub, 20);
    expect(hung.sub.disconnect).toHaveBeenCalledTimes(1);

    const failing = fakeSubscriber(() => Promise.resolve(1));
    failing.sub.status = 'ready';
    failing.sub.quit.mockImplementation(() =>
      Promise.reject(new Error('closed')),
    );
    await closeSubscriber(failing.sub);
    expect(failing.sub.disconnect).toHaveBeenCalledTimes(1);
  });
});
