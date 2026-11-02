import {
  backgroundSubscriber,
  closeSubscriber,
} from './subscribe-in-background';
import {
  brokenRedis,
  fakeSubscriber,
  redisWithSubscriber,
} from './subscribe-in-background.test-support';

const settle = () => new Promise((r) => setImmediate(r));

describe('backgroundSubscriber (boot never waits for Redis)', () => {
  it('wires the handler and sends SUBSCRIBE even when it never settles', () => {
    const { sub, handlers } = fakeSubscriber();
    const seen: string[] = [];
    const bg = backgroundSubscriber(
      redisWithSubscriber(sub),
      'ch',
      (c, m) => seen.push(`${c}:${m}`),
      () => undefined,
    );
    expect(bg).toBeDefined();
    expect(sub.subscribe).toHaveBeenCalledWith('ch');
    handlers[0]('ch', 'hello');
    expect(seen).toEqual(['ch:hello']);
  });

  it('a refused SUBSCRIBE is logged and re-sent on the next ready, until accepted', async () => {
    let n = 0;
    const { sub, readyOnce } = fakeSubscriber(() =>
      n++ < 2 ? Promise.reject(new Error('NOAUTH')) : Promise.resolve(1),
    );
    const warns: string[] = [];
    backgroundSubscriber(
      redisWithSubscriber(sub),
      'ch',
      () => undefined,
      (m) => warns.push(m),
    );
    await settle();
    expect(warns).toEqual([
      'subscribe ch failed, retrying on reconnect: Error: NOAUTH',
    ]);
    readyOnce[0](); // reconnected: refused again
    await settle();
    readyOnce[1](); // accepted: no further retry armed
    await settle();
    expect(sub.subscribe).toHaveBeenCalledTimes(3);
    expect(readyOnce).toHaveLength(2);
  });

  it('a client without duplicate() is a silent no-op; a throwing duplicate() is logged, never thrown', () => {
    const warns: string[] = [];
    expect(
      backgroundSubscriber(
        undefined,
        'ch',
        () => undefined,
        (m) => warns.push(m),
      ),
    ).toBeUndefined();
    expect(
      backgroundSubscriber(
        brokenRedis(),
        'ch',
        () => undefined,
        (m) => warns.push(m),
      ),
    ).toBeUndefined();
    expect(warns).toEqual(['pub/sub client not created: Error: no duplicate']);
  });

  it('close() drops a client that is still waiting for Redis without sending QUIT', async () => {
    const { sub } = fakeSubscriber();
    const bg = backgroundSubscriber(
      redisWithSubscriber(sub),
      'ch',
      () => undefined,
      () => undefined,
    );
    await bg?.close();
    expect(sub.disconnect).toHaveBeenCalledTimes(1);
    expect(sub.quit).not.toHaveBeenCalled();
  });
});

describe('closeSubscriber', () => {
  it('quits a ready client; a QUIT that hangs or fails ends in disconnect', async () => {
    const ok = fakeSubscriber();
    ok.sub.status = 'ready';
    await closeSubscriber(ok.sub);
    expect(ok.sub.quit).toHaveBeenCalledTimes(1);
    expect(ok.sub.disconnect).not.toHaveBeenCalled();

    const hung = fakeSubscriber();
    hung.sub.status = 'ready';
    hung.sub.quit.mockImplementation(() => new Promise(() => undefined));
    await closeSubscriber(hung.sub, 20);
    expect(hung.sub.disconnect).toHaveBeenCalledTimes(1);

    const failing = fakeSubscriber();
    failing.sub.status = 'ready';
    failing.sub.quit.mockImplementation(() =>
      Promise.reject(new Error('closed')),
    );
    await closeSubscriber(failing.sub);
    expect(failing.sub.disconnect).toHaveBeenCalledTimes(1);
  });
});
